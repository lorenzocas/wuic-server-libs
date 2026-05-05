import { AreaExtensions } from 'rete-area-plugin';

/**
 * Context minimo richiesto dal layout helper.
 * Editor/area sono i tipi Rete generici (non tipizzati stretti per evitare
 * generic constraints su TableNode specifico del View Builder).
 */
export type ViewBuilderLayoutContext = {
  editor: any;
  area: any;
  /** Restituisce il DOM host element del nodo (rete-angular-plugin monta
   *  un custom element `<node-<id>>` dentro il canvas). Serve per leggere
   *  dimensioni reali via `getBoundingClientRect()` invece dei valori
   *  statici dichiarati sul TableNode (che sono approssimati). */
  findNodeHostElement: (nodeId: string) => HTMLElement | null;
};

/** Dimensioni misurate di un nodo in coordinate canvas (post-zoom). */
type NodeSize = { w: number; h: number };

/** Rect in coordinate canvas usato per overlap detection. */
type Rect = { x: number; y: number; w: number; h: number };

/**
 * Layout helper dedicato al View Builder del Pivot Builder.
 *
 * Principi di layout:
 *  - Flusso orizzontale left→right basato sul grafo delle connessioni
 *    (equivalente a dagre `rankdir=LR`).
 *  - BFS dal nodo "root" (nessuna incoming connection) → livello 0.
 *  - Livello target = max(livello corrente, livello sorgente + 1).
 *  - Nodi isolati (senza connessioni) → livello 0 come i root.
 *  - Ogni livello ha una colonna con x uniforme (= width_colonna + gap).
 *  - Dentro un livello i nodi si distribuiscono verticalmente con vGap.
 *  - Pass finale: se una connessione passa sopra un nodo non coinvolto,
 *    sposto il nodo in una corsia vicina libera.
 *  - Zoom-to-fit al termine via `AreaExtensions.zoomAt(area, allNodes)`.
 *
 * Indipendente dal workflow-designer: non usa concetti start/end/action
 * che nel View Builder non hanno senso.
 */
export class ViewBuilderLayoutHelper {
  /** Gap orizzontale tra colonne (livelli). */
  static readonly H_GAP = 120;
  /** Gap verticale tra nodi stesso livello. */
  static readonly V_GAP = 80;
  /** Margine superiore dal top del canvas. */
  static readonly TOP_MARGIN = 40;
  /** Margine sinistro dal left del canvas. */
  static readonly LEFT_MARGIN = 40;
  /** Fallback dimensioni nodo se il DOM non risponde. */
  static readonly FALLBACK_W = 280;
  static readonly FALLBACK_H = 260;

  /**
   * Attende qualche frame di render + micro-pausa cosi' DOM / bounding box /
   * connection SVG paths si assestano dopo mutazioni (addNode, addConnection,
   * translate). Stessa logica del workflow-designer-layout.helper.
   */
  static async waitForRenderSettle(frames: number = 3): Promise<void> {
    const count = Math.max(1, Number(frames || 1));
    for (let i = 0; i < count; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    await new Promise<void>((r) => setTimeout(r, 24));
  }

  /**
   * Applica il layout orizzontale + zoom-to-fit. Entry point principale.
   * Idempotente: chiamabile piu' volte senza effetti collaterali.
   */
  static async applyHorizontalLayout(ctx: ViewBuilderLayoutContext): Promise<void> {
    if (!ctx.editor || !ctx.area) return;
    const nodes = ctx.editor.getNodes() as any[];
    if (!nodes.length) return;

    await this.waitForRenderSettle();

    // 1. Calcola livelli (BFS sul grafo delle connessioni).
    const levels = this.computeNodeLevels(ctx);

    // 2. Misura dimensione reale di ogni nodo (DOM bbox o fallback).
    const sizes: Record<string, NodeSize> = {};
    let colWidth = this.FALLBACK_W;
    for (const n of nodes) {
      sizes[n.id] = this.measureNode(ctx, n.id);
      colWidth = Math.max(colWidth, sizes[n.id].w);
    }

    // 3. Raggruppa per livello + calcola x,y di ogni nodo.
    const byLevel = new Map<number, any[]>();
    for (const n of nodes) {
      const lvl = levels.get(String(n.id)) ?? 0;
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl)!.push(n);
    }

    const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
    for (const lvl of sortedLevels) {
      const nodesAtLevel = byLevel.get(lvl)!;
      const x = this.LEFT_MARGIN + lvl * (colWidth + this.H_GAP);
      let y = this.TOP_MARGIN;
      for (const n of nodesAtLevel) {
        await ctx.area.translate(n.id, { x, y });
        y += (sizes[n.id]?.h || this.FALLBACK_H) + this.V_GAP;
      }
    }

    await this.waitForRenderSettle(2);

    // 4. Pass anti-overlap link/tabelle: sposta nodi non-coinvolti fuori
    //    dai path delle connessioni che li attraversano.
    for (let pass = 0; pass < 3; pass++) {
      const moved = await this.resolveLinkNodeOverlaps(ctx, sizes);
      if (!moved) break;
      await this.waitForRenderSettle(1);
    }

    // 5. Zoom-to-fit finale.
    await this.zoomToFit(ctx);
  }

  /**
   * Calcola il livello di ogni nodo via topological sort / BFS.
   * - Nodi senza incoming connection → livello 0 (root).
   * - target-livello = max(target-livello, source-livello + 1).
   * - Fallback cicli: se un loop e' presente, i nodi ciclici restano
   *   al livello minimo calcolato durante la BFS (no infinite loop).
   */
  private static computeNodeLevels(ctx: ViewBuilderLayoutContext): Map<string, number> {
    const nodes = ctx.editor.getNodes() as any[];
    const connections = ctx.editor.getConnections() as any[];

    // Map nodeId → level
    const level = new Map<string, number>();
    // adjacency: source → [target, target, ...]
    const outgoing = new Map<string, string[]>();
    // incoming count: per detectare nodi root
    const indeg = new Map<string, number>();

    for (const n of nodes) {
      level.set(String(n.id), 0);
      outgoing.set(String(n.id), []);
      indeg.set(String(n.id), 0);
    }
    for (const c of connections) {
      const src = String(c.source);
      const tgt = String(c.target);
      outgoing.get(src)?.push(tgt);
      indeg.set(tgt, (indeg.get(tgt) || 0) + 1);
    }

    // BFS dalle sorgenti (indeg=0).
    const queue: string[] = [];
    for (const n of nodes) {
      if ((indeg.get(String(n.id)) || 0) === 0) {
        queue.push(String(n.id));
      }
    }
    // Se nessun root (grafo ciclico puro), forziamo il primo nodo come root
    // per non lasciare tutto a livello 0.
    if (!queue.length && nodes.length) {
      queue.push(String(nodes[0].id));
    }

    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const lvl = level.get(id) || 0;
      for (const tgt of outgoing.get(id) || []) {
        const tgtLvl = level.get(tgt) || 0;
        if (lvl + 1 > tgtLvl) {
          level.set(tgt, lvl + 1);
        }
        if (!visited.has(tgt)) {
          queue.push(tgt);
        }
      }
    }

    return level;
  }

  /**
   * Misura le dimensioni reali di un nodo dal DOM. Fallback ai valori
   * statici dichiarati sul TableNode se l'element non e' trovato o ha
   * dimensioni nulle (es. nodo appena aggiunto prima del primo render).
   */
  private static measureNode(ctx: ViewBuilderLayoutContext, nodeId: string): NodeSize {
    const el = ctx.findNodeHostElement(nodeId);
    if (el) {
      const rect = el.getBoundingClientRect();
      // Converti da pixel viewport a coordinate canvas scalando per lo
      // zoom corrente. area.area.transform.k e' il fattore zoom.
      const zoom = ctx.area?.area?.transform?.k || 1;
      const w = rect.width / zoom;
      const h = rect.height / zoom;
      if (w > 0 && h > 0) return { w, h };
    }
    const node = ctx.editor.getNode(nodeId);
    return {
      w: Number((node as any)?.width) || this.FALLBACK_W,
      h: Number((node as any)?.height) || this.FALLBACK_H,
    };
  }

  /**
   * Restituisce il rect di un nodo in coordinate canvas.
   */
  private static getNodeRect(ctx: ViewBuilderLayoutContext, nodeId: string, sizes: Record<string, NodeSize>): Rect | null {
    const view = ctx.area?.nodeViews?.get(nodeId);
    if (!view) return null;
    const pos = view.position;
    const s = sizes[nodeId] || { w: this.FALLBACK_W, h: this.FALLBACK_H };
    return { x: pos.x, y: pos.y, w: s.w, h: s.h };
  }

  /**
   * Pass anti-overlap tra le connessioni e i box dei nodi. Strategia:
   *  - Per ogni connessione `src → tgt` stimiamo il segmento principale
   *    come retta che unisce il centro-destra(src) → centro-sinistra(tgt).
   *  - Per ogni nodo non-coinvolto nella connessione testiamo
   *    `rectIntersectsSegment`. Se intersect, spostiamo il nodo
   *    verticalmente (giu' se il segmento e' sopra il centro nodo,
   *    altrimenti su) di un passo (`V_GAP`).
   *  - Ritorniamo il conteggio di nodi spostati per permettere al
   *    caller di iterare fino a convergenza.
   */
  private static async resolveLinkNodeOverlaps(ctx: ViewBuilderLayoutContext, sizes: Record<string, NodeSize>): Promise<number> {
    const connections = ctx.editor.getConnections() as any[];
    const nodes = ctx.editor.getNodes() as any[];
    let moved = 0;

    for (const c of connections) {
      const srcRect = this.getNodeRect(ctx, String(c.source), sizes);
      const tgtRect = this.getNodeRect(ctx, String(c.target), sizes);
      if (!srcRect || !tgtRect) continue;
      const p1 = { x: srcRect.x + srcRect.w, y: srcRect.y + srcRect.h / 2 };
      const p2 = { x: tgtRect.x, y: tgtRect.y + tgtRect.h / 2 };

      for (const n of nodes) {
        const nid = String(n.id);
        if (nid === String(c.source) || nid === String(c.target)) continue;
        const rect = this.getNodeRect(ctx, nid, sizes);
        if (!rect) continue;
        if (!this.segmentIntersectsRect(p1, p2, rect)) continue;

        // Sposta verticalmente fuori dal segmento. Direzione: se il
        // centro del nodo e' sotto la retta nell'intervallo x del nodo,
        // sposta giu'; altrimenti su.
        const nodeCenterY = rect.y + rect.h / 2;
        const yOnSegmentAtNodeX = this.interpolateY(p1, p2, rect.x + rect.w / 2);
        const pushDown = nodeCenterY >= yOnSegmentAtNodeX;
        const dy = (this.V_GAP + rect.h / 2) * (pushDown ? 1 : -1);
        const view = ctx.area?.nodeViews?.get(nid);
        const newY = (view?.position?.y || rect.y) + dy;
        await ctx.area.translate(nid, { x: rect.x, y: newY });
        moved++;
      }
    }

    return moved;
  }

  /** Segmento p1→p2 interseca il rect? Test line-vs-rect semplice. */
  private static segmentIntersectsRect(p1: { x: number; y: number }, p2: { x: number; y: number }, rect: Rect): boolean {
    // Bounding box del segmento vs rect (early reject).
    const segMinX = Math.min(p1.x, p2.x);
    const segMaxX = Math.max(p1.x, p2.x);
    if (segMaxX < rect.x || segMinX > rect.x + rect.w) return false;
    const segMinY = Math.min(p1.y, p2.y);
    const segMaxY = Math.max(p1.y, p2.y);
    if (segMaxY < rect.y || segMinY > rect.y + rect.h) return false;
    // Accurate: campiona Y del segmento a 5 x equidistanti nella x-overlap
    // e verifica se almeno una finisce dentro rect.y..rect.y+rect.h.
    const xStart = Math.max(segMinX, rect.x);
    const xEnd = Math.min(segMaxX, rect.x + rect.w);
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const x = xStart + ((xEnd - xStart) * i) / steps;
      const y = this.interpolateY(p1, p2, x);
      if (y >= rect.y && y <= rect.y + rect.h) return true;
    }
    return false;
  }

  /** Interpola Y di un segmento dato X (lineare). */
  private static interpolateY(p1: { x: number; y: number }, p2: { x: number; y: number }, x: number): number {
    if (Math.abs(p2.x - p1.x) < 0.001) return p1.y;
    const t = (x - p1.x) / (p2.x - p1.x);
    return p1.y + t * (p2.y - p1.y);
  }

  /**
   * Zoom-to-fit finale: usa l'API `AreaExtensions.zoomAt` di rete-area-plugin
   * che calcola bounding box di tutti i nodi e centra+scala il viewport.
   * Fallback silenzioso se area non disponibile.
   */
  private static async zoomToFit(ctx: ViewBuilderLayoutContext): Promise<void> {
    try {
      const nodes = ctx.editor.getNodes() as any[];
      if (!nodes.length) return;
      await AreaExtensions.zoomAt(ctx.area, nodes);
    } catch { /* no-op */ }
  }
}
