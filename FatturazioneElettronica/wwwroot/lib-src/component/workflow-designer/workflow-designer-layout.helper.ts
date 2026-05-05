type WorkflowNodeLike = any;

export type WorkflowDesignerLayoutContext = {
  editor: any;
  area: any;
  getNodeById: (nodeId: string) => WorkflowNodeLike | null;
  findStartNode: () => WorkflowNodeLike | null;
  findNodeHostElement: (nodeId: string) => HTMLElement | null;
};

export class WorkflowDesignerLayoutHelper {
  /**
   * Attende alcuni frame di rendering + una breve pausa per stabilizzare node views e bounding box dopo translate/mutate.
   * @param frames Numero frame `requestAnimationFrame` da attendere.
   */
  static async waitForRenderSettle(frames: number = 3): Promise<void> {
    const count = Math.max(1, Number(frames || 1));
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 24));
  }

  /**
   * Ricalcola i livelli del grafo (BFS da start/root) e riallinea le x dei nodi per ottenere una spaziatura orizzontale coerente.
   * @param ctx Contesto editor/area helper.
   * @param gap Distanza orizzontale minima tra livelli adiacenti.
   */
  static async normalizeHorizontalSpacingByGraphLevels(ctx: WorkflowDesignerLayoutContext, gap: number = 120): Promise<void> {
    const nodes = ctx.editor?.getNodes?.() || [];
    if (!ctx.editor || !ctx.area || !nodes.length) {
      return;
    }

    const nodeIds = nodes.map((n: WorkflowNodeLike) => String(n.id || ''));
    const nodeById = new Map<string, WorkflowNodeLike>(nodes.map((n: WorkflowNodeLike) => [String(n.id || ''), n]));
    const outgoing = new Map<string, string[]>();
    const incomingCount = new Map<string, number>(nodeIds.map((id) => [id, 0]));

    for (const connection of (ctx.editor.getConnections?.() || [])) {
      const source = String(connection?.source || '');
      const target = String(connection?.target || '');
      if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) {
        continue;
      }
      if (!outgoing.has(source)) {
        outgoing.set(source, []);
      }
      outgoing.get(source)!.push(target);
      incomingCount.set(target, Number(incomingCount.get(target) || 0) + 1);
    }

    const levels = new Map<string, number>();
    const startNode = ctx.findStartNode();
    const startId = String(startNode?.id || '');

    const roots = nodes
      .filter((n: WorkflowNodeLike) => Number(incomingCount.get(String(n.id || '')) || 0) === 0)
      .sort((a: WorkflowNodeLike, b: WorkflowNodeLike) => {
        const ax = Number(ctx.area?.nodeViews?.get(String(a.id || ''))?.position?.x || 0);
        const bx = Number(ctx.area?.nodeViews?.get(String(b.id || ''))?.position?.x || 0);
        return ax - bx;
      })
      .map((n: WorkflowNodeLike) => String(n.id || ''));

    const queue: string[] = [];
    if (startId && nodeById.has(startId)) {
      levels.set(startId, 0);
      queue.push(startId);
    }
    for (const root of roots) {
      if (!levels.has(root)) {
        levels.set(root, startId ? 1 : 0);
        queue.push(root);
      }
    }

    while (queue.length) {
      const id = String(queue.shift() || '');
      const level = Number(levels.get(id) || 0);
      const targets = outgoing.get(id) || [];
      for (const target of targets) {
        const nextLevel = level + 1;
        const current = levels.get(target);
        if (current === undefined || nextLevel > current) {
          levels.set(target, nextLevel);
          queue.push(target);
        }
      }
    }

    let maxLevel = Math.max(0, ...Array.from(levels.values()));
    const leftovers = nodeIds
      .filter((id) => !levels.has(id))
      .sort((a, b) => {
        const ax = Number(ctx.area?.nodeViews?.get(a)?.position?.x || 0);
        const bx = Number(ctx.area?.nodeViews?.get(b)?.position?.x || 0);
        return ax - bx;
      });
    for (const id of leftovers) {
      maxLevel += 1;
      levels.set(id, maxLevel);
    }

    const byLevel = new Map<number, string[]>();
    levels.forEach((level, id) => {
      if (!byLevel.has(level)) {
        byLevel.set(level, []);
      }
      byLevel.get(level)!.push(id);
    });

    const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    const levelWidths = new Map<number, number>();
    for (const level of sortedLevels) {
      const ids = byLevel.get(level) || [];
      const maxWidth = Math.max(
        ...ids.map((id) => {
          const node = nodeById.get(id);
          const size = node ? (this.getRenderedNodeSceneSize(ctx, node) || this.getNodeApproxSize(node)) : { w: 220, h: 96 };
          return Number(size.w || 220);
        }),
        220
      );
      levelWidths.set(level, maxWidth);
    }

    const minCurrentX = Math.min(...nodeIds.map((id) => Number(ctx.area?.nodeViews?.get(id)?.position?.x || 0)));
    const xByLevel = new Map<number, number>();
    for (let i = 0; i < sortedLevels.length; i++) {
      const level = sortedLevels[i];
      if (i === 0) {
        xByLevel.set(level, minCurrentX);
        continue;
      }
      const prevLevel = sortedLevels[i - 1];
      const prevX = Number(xByLevel.get(prevLevel) || minCurrentX);
      const prevW = Number(levelWidths.get(prevLevel) || 220);
      xByLevel.set(level, prevX + prevW + gap);
    }

    for (const level of sortedLevels) {
      const targetX = Number(xByLevel.get(level) || minCurrentX);
      const ids = byLevel.get(level) || [];
      for (const id of ids) {
        const pos = ctx.area?.nodeViews?.get(id)?.position;
        if (!pos) {
          continue;
        }
        await ctx.area.translate(id, { x: targetX, y: Number(pos.y || 0) });
      }
    }
  }

  /**
   * Risolve sovrapposizioni partendo da un nodo seed, spostando progressivamente i nodi in collisione lungo Y.
   * @param ctx Contesto editor/area helper.
   * @param seedNodeId Nodo da cui avviare la propagazione anti-overlap.
   * @returns Numero spostamenti applicati.
   */
  static async resolveNodeOverlapsFrom(ctx: WorkflowDesignerLayoutContext, seedNodeId: string): Promise<number> {
    if (!ctx.editor || !ctx.area || !seedNodeId) {
      return 0;
    }

    const margin = 18;
    const pushStepY = 28;
    const maxMoves = 400;
    const queue: string[] = [seedNodeId];
    let moves = 0;

    while (queue.length && moves < maxMoves) {
      const currentId = String(queue.shift() || '');
      const currentNode = ctx.getNodeById(currentId);
      if (!currentNode) {
        continue;
      }

      const currentRect = this.getNodeRect(ctx, currentNode, margin);
      if (!currentRect) {
        continue;
      }

      for (const otherNode of (ctx.editor.getNodes?.() || [])) {
        const otherId = String(otherNode.id || '');
        if (!otherId || otherId === currentId) {
          continue;
        }

        const otherRect = this.getNodeRect(ctx, otherNode, margin);
        if (!otherRect || !this.rectanglesOverlap(currentRect, otherRect)) {
          continue;
        }

        const currentCenterY = currentRect.y + (currentRect.h / 2);
        const otherCenterY = otherRect.y + (otherRect.h / 2);
        const overlapY = Math.max(
          0,
          Math.min(currentRect.y + currentRect.h, otherRect.y + otherRect.h) - Math.max(currentRect.y, otherRect.y)
        );
        const deltaY = Math.max(pushStepY, overlapY + pushStepY);

        const primarySign = otherCenterY >= currentCenterY ? 1 : -1;
        const yPrimary = otherRect.y + (deltaY * primarySign);
        const ySecondary = otherRect.y - (deltaY * primarySign);

        const primaryPenalty = this.countOverlapsAtPosition(
          ctx,
          String(otherNode.id || ''),
          { x: otherRect.x, y: yPrimary, w: otherRect.w, h: otherRect.h },
          String(currentNode.id || ''),
          margin
        );
        const secondaryPenalty = this.countOverlapsAtPosition(
          ctx,
          String(otherNode.id || ''),
          { x: otherRect.x, y: ySecondary, w: otherRect.w, h: otherRect.h },
          String(currentNode.id || ''),
          margin
        );

        const nextY = secondaryPenalty < primaryPenalty ? ySecondary : yPrimary;
        const nextX = otherRect.x;

        await ctx.area.translate(otherNode.id, { x: nextX, y: nextY });
        queue.push(otherId);
        moves += 1;
        if (moves >= maxMoves) {
          break;
        }
      }
    }

    return moves;
  }

  private static countOverlapsAtPosition(
    ctx: WorkflowDesignerLayoutContext,
    movingNodeId: string,
    candidateRect: { x: number; y: number; w: number; h: number },
    ignoreNodeId: string,
    margin: number
  ): number {
    let overlaps = 0;
    for (const node of (ctx.editor?.getNodes?.() || [])) {
      const nodeId = String(node?.id || '');
      if (!nodeId || nodeId === movingNodeId || nodeId === ignoreNodeId) {
        continue;
      }
      const rect = this.getNodeRect(ctx, node, margin);
      if (!rect) {
        continue;
      }
      if (this.rectanglesOverlap(candidateRect, rect)) {
        overlaps += 1;
      }
    }
    return overlaps;
  }

  /**
   * Garantisce che il nodo `start` resti il piu a sinistra, spostando a destra eventuali nodi che lo sovrappongono/precedono.
   * @param ctx Contesto editor/area helper.
   * @param minGap Gap minimo richiesto tra start e gli altri nodi.
   */
  static async ensureStartNodeLeftmost(ctx: WorkflowDesignerLayoutContext, minGap: number = 24): Promise<void> {
    if (!ctx.editor || !ctx.area) {
      return;
    }

    const startNode = ctx.findStartNode();
    if (!startNode) {
      return;
    }

    const startId = String(startNode.id || '');
    const startRect = this.getNodeRect(ctx, startNode, 12);
    if (!startRect) {
      return;
    }

    const otherPositions = (ctx.editor.getNodes?.() || [])
      .filter((node: WorkflowNodeLike) => String(node.id || '') !== startId)
      .map((node: WorkflowNodeLike) => ({
        id: String(node.id || ''),
        pos: ctx.area?.nodeViews?.get(String(node.id || ''))?.position
      }))
      .filter((x: any) => !!x.id && !!x.pos) as Array<{ id: string; pos: { x: number; y: number } }>;

    if (!otherPositions.length) {
      return;
    }

    for (const item of otherPositions) {
      const otherNode = ctx.getNodeById(item.id);
      if (!otherNode) {
        continue;
      }
      const otherRect = this.getNodeRect(ctx, otherNode, 12);
      if (!otherRect || !this.rectanglesOverlap(startRect, otherRect)) {
        continue;
      }

      const requiredX = startRect.x + startRect.w + minGap;
      const deltaX = requiredX - otherRect.x;
      if (deltaX > 0) {
        await ctx.area.translate(item.id, {
          x: Number(item.pos.x || 0) + deltaX,
          y: Number(item.pos.y || 0)
        });
      }
    }

    await this.waitForRenderSettle(1);

    const refreshedOthers = (ctx.editor.getNodes?.() || [])
      .filter((node: WorkflowNodeLike) => String(node.id || '') !== startId)
      .map((node: WorkflowNodeLike) => ({
        id: String(node.id || ''),
        pos: ctx.area?.nodeViews?.get(String(node.id || ''))?.position
      }))
      .filter((x: any) => !!x.id && !!x.pos) as Array<{ id: string; pos: { x: number; y: number } }>;

    if (!refreshedOthers.length) {
      return;
    }

    const requiredMinOtherX = startRect.x + startRect.w + minGap;
    const minOtherX = Math.min(...refreshedOthers.map((x) => Number(x.pos.x || 0)));
    if (minOtherX >= requiredMinOtherX) {
      return;
    }

    const deltaX = requiredMinOtherX - minOtherX;
    for (const item of refreshedOthers) {
      await ctx.area.translate(item.id, {
        x: Number(item.pos.x || 0) + deltaX,
        y: Number(item.pos.y || 0)
      });
    }
  }

  /**
   * Forza il nodo `end` ad essere il piu a destra rispetto al resto del grafo.
   * @param ctx Contesto editor/area helper.
   * @param minGap Distanza minima dal right edge massimo degli altri nodi.
   */
  static async ensureEndNodeRightmost(ctx: WorkflowDesignerLayoutContext, minGap: number = 24): Promise<void> {
    if (!ctx.editor || !ctx.area) {
      return;
    }

    const nodes = ctx.editor.getNodes?.() || [];
    if (!nodes.length) {
      return;
    }

    const endNode = nodes.find((node: WorkflowNodeLike) => String(node?.workflowType || '') === 'end');
    if (!endNode) {
      return;
    }

    const endId = String(endNode.id || '');
    const endRect = this.getNodeRect(ctx, endNode, 0);
    if (!endRect) {
      return;
    }

    let maxRight = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      const nodeId = String(node?.id || '');
      if (!nodeId || nodeId === endId) {
        continue;
      }

      const rect = this.getNodeRect(ctx, node, 0);
      if (!rect) {
        continue;
      }
      maxRight = Math.max(maxRight, rect.x + rect.w);
    }

    if (!Number.isFinite(maxRight)) {
      return;
    }

    const targetX = maxRight + minGap;
    if (targetX <= endRect.x) {
      return;
    }

    await ctx.area.translate(endNode.id, {
      x: targetX,
      y: Number(endRect.y || 0)
    });
  }

  /**
   * Allinea i nodi `action` per route sorgente, disponendoli in colonna a destra del nodo route e distribuendoli verticalmente.
   * @param ctx Contesto editor/area helper.
   * @param horizontalGap Gap X dal nodo route sorgente.
   * @param verticalGap Gap Y tra action siblings.
   * @returns Numero nodi action riposizionati.
   */
  static async alignActionNodesBySourceRoute(ctx: WorkflowDesignerLayoutContext, horizontalGap: number = 120, verticalGap: number = 118): Promise<number> {
    if (!ctx.editor || !ctx.area) {
      return 0;
    }

    const nodes = ctx.editor.getNodes?.() || [];
    const nodeById = new Map<string, WorkflowNodeLike>(nodes.map((n: WorkflowNodeLike) => [String(n.id || ''), n]));
    const groups = new Map<string, string[]>();

    const resolveIncomingSourceId = (actionId: string): string => {
      const incoming = (ctx.editor.getConnections?.() || []).find((connection: any) =>
        String(connection?.target || '') === actionId
        && String(connection?.targetInput || '') === 'in'
      );
      return incoming ? String(incoming?.source || '') : '';
    };

    nodes.forEach((node: WorkflowNodeLike) => {
      if (String(node?.workflowType || '') !== 'action') {
        return;
      }

      const actionId = String(node.id || '');
      const explicitRouteId = String(node?.workflowRouteNodeId || '').trim();
      const incomingSourceId = resolveIncomingSourceId(actionId);
      const fallbackRouteId = incomingSourceId && String((nodeById.get(incomingSourceId) as any)?.workflowType || '') === 'route'
        ? incomingSourceId
        : '';
      const routeId = explicitRouteId || fallbackRouteId;
      if (!routeId || !nodeById.has(routeId)) {
        return;
      }

      if (!groups.has(routeId)) {
        groups.set(routeId, []);
      }
      groups.get(routeId)!.push(actionId);
    });

    let moved = 0;
    for (const [routeId, actionIds] of groups.entries()) {
      const routeNode = nodeById.get(routeId);
      if (!routeNode) {
        continue;
      }

      const routeRect = this.getNodeRect(ctx, routeNode, 0);
      if (!routeRect) {
        continue;
      }

      const sourceCenterY = routeRect.y + (routeRect.h / 2);
      const anchorX = routeRect.x + routeRect.w + horizontalGap;
      const sorted = [...actionIds].sort((a, b) => {
        const ay = Number(ctx.area?.nodeViews?.get(a)?.position?.y || 0);
        const by = Number(ctx.area?.nodeViews?.get(b)?.position?.y || 0);
        return ay - by;
      });

      for (let i = 0; i < sorted.length; i++) {
        const actionId = sorted[i];
        const actionNode = nodeById.get(actionId);
        if (!actionNode) {
          continue;
        }

        const currentPos = ctx.area?.nodeViews?.get(actionId)?.position;
        if (!currentPos) {
          continue;
        }

        const actionSize = this.getRenderedNodeSceneSize(ctx, actionNode) || this.getNodeApproxSize(actionNode);
        const targetCenterY = sourceCenterY + ((i - ((sorted.length - 1) / 2)) * verticalGap);
        const targetY = targetCenterY - (Number(actionSize.h || 96) / 2);

        const incomingSourceId = resolveIncomingSourceId(actionId);
        let minX = routeRect.x + routeRect.w + 24;
        if (incomingSourceId) {
          const incomingSourceNode = nodeById.get(incomingSourceId);
          const incomingRect = incomingSourceNode ? this.getNodeRect(ctx, incomingSourceNode, 0) : null;
          if (incomingRect) {
            minX = Math.max(minX, incomingRect.x + incomingRect.w + 24);
          }
        }
        const targetX = Math.max(anchorX, minX);

        if (Math.abs(Number(currentPos.x || 0) - targetX) < 1 && Math.abs(Number(currentPos.y || 0) - targetY) < 1) {
          continue;
        }

        await ctx.area.translate(actionNode.id, { x: targetX, y: targetY });
        moved += 1;
      }
    }

    return moved;
  }

  /**
   * Riduce intersezioni nodo-connessione: quando un segmento attraversa un nodo terzo, lo sposta su una lane verticale alternativa.
   * @param ctx Contesto editor/area helper.
   * @param corridorPadding Margine extra del corridoio collisione attorno al nodo.
   * @param laneStep Step verticale applicato a ogni spostamento anti-overlap.
   * @returns Numero nodi spostati.
   */
  static async avoidNodeConnectionOverlaps(ctx: WorkflowDesignerLayoutContext, corridorPadding: number = 16, laneStep: number = 78): Promise<number> {
    if (!ctx.editor || !ctx.area) {
      return 0;
    }

    const nodes = ctx.editor.getNodes?.() || [];
    if (!nodes.length) {
      return 0;
    }

    const nodeById = new Map<string, WorkflowNodeLike>(nodes.map((n: WorkflowNodeLike) => [String(n.id || ''), n]));
    let moved = 0;

    for (const connection of (ctx.editor.getConnections?.() || [])) {
      const sourceId = String(connection?.source || '');
      const targetId = String(connection?.target || '');
      const sourceNode = nodeById.get(sourceId);
      const targetNode = nodeById.get(targetId);
      if (!sourceNode || !targetNode) {
        continue;
      }

      const segment = this.getConnectionSegment(ctx, sourceNode, targetNode);
      if (!segment) {
        continue;
      }

      for (const node of nodes) {
        const nodeId = String(node.id || '');
        if (!nodeId || nodeId === sourceId || nodeId === targetId) {
          continue;
        }

        const rect = this.getNodeRect(ctx, node, 0);
        if (!rect) {
          continue;
        }

        if (!this.segmentIntersectsRect(segment.p1, segment.p2, rect, corridorPadding)) {
          continue;
        }

        const pos = ctx.area?.nodeViews?.get(nodeId)?.position;
        if (!pos) {
          continue;
        }

        const rectMidX = rect.x + (rect.w / 2);
        const segY = this.interpolateSegmentY(segment.p1, segment.p2, rectMidX);
        const rectMidY = rect.y + (rect.h / 2);
        const goDown = !Number.isFinite(segY) || rectMidY >= segY;
        const deltaY = goDown ? laneStep : -laneStep;

        await ctx.area.translate(node.id, {
          x: Number(pos.x || 0),
          y: Number(pos.y || 0) + deltaY
        });
        moved += 1;
      }
    }

    return moved;
  }

  static getNodeRect(ctx: WorkflowDesignerLayoutContext, node: WorkflowNodeLike, margin: number): { x: number; y: number; w: number; h: number } | null {
    if (!ctx.area || !node) {
      return null;
    }

    const pos = ctx.area?.nodeViews?.get(String(node.id || ''))?.position;
    if (!pos) {
      return null;
    }

    const size = this.getRenderedNodeSceneSize(ctx, node) || this.getNodeApproxSize(node);
    return {
      x: Number(pos.x || 0),
      y: Number(pos.y || 0),
      w: Number(size.w || 0) + margin,
      h: Number(size.h || 0) + margin
    };
  }

  static rectanglesOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
    return a.x < (b.x + b.w)
      && (a.x + a.w) > b.x
      && a.y < (b.y + b.h)
      && (a.y + a.h) > b.y;
  }

  static getNodeApproxSize(node: WorkflowNodeLike): { w: number; h: number } {
    const type = String(node?.workflowType || '');
    const actionTypeId = Number(node?.workflowActionTypeId);

    if (type === 'start' || type === 'end') {
      return { w: 210, h: 96 };
    }
    if (type === 'route') {
      return { w: 240, h: 96 };
    }
    if (type === 'condition') {
      return { w: 228, h: 96 };
    }
    if (type === 'action') {
      if (actionTypeId === 2 || actionTypeId === 6) {
        return { w: 248, h: 96 };
      }
      return { w: 238, h: 96 };
    }
    return { w: 228, h: 96 };
  }

  static getRenderedNodeSceneSize(ctx: WorkflowDesignerLayoutContext, node: WorkflowNodeLike): { w: number; h: number } | null {
    if (!ctx.area || !node) {
      return null;
    }

    const host = ctx.findNodeHostElement(String(node.id || ''));
    if (!host) {
      return null;
    }

    const visualNode = (host.querySelector('.node') as HTMLElement | null) || host;
    const rect = visualNode.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const scale = Number(ctx.area?.area?.transform?.k || 1);
    const safeScale = scale > 0 ? scale : 1;
    return {
      w: rect.width / safeScale,
      h: rect.height / safeScale
    };
  }

  private static getConnectionSegment(
    ctx: WorkflowDesignerLayoutContext,
    sourceNode: WorkflowNodeLike,
    targetNode: WorkflowNodeLike
  ): { p1: { x: number; y: number }; p2: { x: number; y: number } } | null {
    const sourceRect = this.getNodeRect(ctx, sourceNode, 0);
    const targetRect = this.getNodeRect(ctx, targetNode, 0);
    if (!sourceRect || !targetRect) {
      return null;
    }

    const sourceCx = sourceRect.x + (sourceRect.w / 2);
    const sourceCy = sourceRect.y + (sourceRect.h / 2);
    const targetCx = targetRect.x + (targetRect.w / 2);
    const targetCy = targetRect.y + (targetRect.h / 2);

    const leftToRight = targetCx >= sourceCx;
    const p1 = { x: leftToRight ? (sourceRect.x + sourceRect.w) : sourceRect.x, y: sourceCy };
    const p2 = { x: leftToRight ? targetRect.x : (targetRect.x + targetRect.w), y: targetCy };
    return { p1, p2 };
  }

  private static interpolateSegmentY(p1: { x: number; y: number }, p2: { x: number; y: number }, x: number): number {
    const dx = Number(p2.x - p1.x);
    if (Math.abs(dx) < 0.0001) {
      return Number.NaN;
    }
    const t = (x - p1.x) / dx;
    return p1.y + ((p2.y - p1.y) * t);
  }

  private static segmentIntersectsRect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    rect: { x: number; y: number; w: number; h: number },
    padding: number
  ): boolean {
    const expanded = {
      x: rect.x - padding,
      y: rect.y - padding,
      w: rect.w + (padding * 2),
      h: rect.h + (padding * 2)
    };

    if (this.pointInRect(p1, expanded) || this.pointInRect(p2, expanded)) {
      return true;
    }

    const r1 = { x: expanded.x, y: expanded.y };
    const r2 = { x: expanded.x + expanded.w, y: expanded.y };
    const r3 = { x: expanded.x + expanded.w, y: expanded.y + expanded.h };
    const r4 = { x: expanded.x, y: expanded.y + expanded.h };

    return this.segmentsIntersect(p1, p2, r1, r2)
      || this.segmentsIntersect(p1, p2, r2, r3)
      || this.segmentsIntersect(p1, p2, r3, r4)
      || this.segmentsIntersect(p1, p2, r4, r1);
  }

  private static pointInRect(p: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }): boolean {
    return p.x >= rect.x
      && p.x <= (rect.x + rect.w)
      && p.y >= rect.y
      && p.y <= (rect.y + rect.h);
  }

  private static segmentsIntersect(
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ): boolean {
    const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): number =>
      ((q.y - p.y) * (r.x - q.x)) - ((q.x - p.x) * (r.y - q.y));

    const onSeg = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): boolean =>
      q.x <= Math.max(p.x, r.x)
      && q.x >= Math.min(p.x, r.x)
      && q.y <= Math.max(p.y, r.y)
      && q.y >= Math.min(p.y, r.y);

    const o1 = orient(a1, a2, b1);
    const o2 = orient(a1, a2, b2);
    const o3 = orient(b1, b2, a1);
    const o4 = orient(b1, b2, a2);

    if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
      return true;
    }

    if (o1 === 0 && onSeg(a1, b1, a2)) {
      return true;
    }
    if (o2 === 0 && onSeg(a1, b2, a2)) {
      return true;
    }
    if (o3 === 0 && onSeg(b1, a1, b2)) {
      return true;
    }
    if (o4 === 0 && onSeg(b1, a2, b2)) {
      return true;
    }

    return false;
  }
}
