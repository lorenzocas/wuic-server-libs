// Test scritti per `@angular/build:unit-test` (vitest, runner di default del lib
// dalla migrazione karma->vitest in poi). describe/it/expect sono globals via
// `tsconfig.spec.json` -> `types: ["vitest/globals"]`, niente import esplicito.
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import {
  RagChatResponse,
  RagHealthResponse,
  RagQueryResponse,
  WuicRagService,
} from './wuic-rag.service';

describe('WuicRagService', () => {
  let service: WuicRagService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [WuicRagService],
    });
    service = TestBed.inject(WuicRagService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // L'URL effettivo e' "<origin>/api/Rag/<Action>" ma in test environment
  // window.location.origin varia (jsdom o karma host), quindi confrontiamo
  // sul suffisso del path per restare robusti.
  function expectRequestEndingWith(suffix: string) {
    const reqs = httpMock.match((req) => req.url.endsWith(suffix));
    expect(reqs.length).toBe(1);
    return reqs[0];
  }

  describe('query()', () => {
    it('POST /api/Rag/Query con default top_k=8 e use_lora=true', () => {
      const expected: RagQueryResponse = {
        results: [
          {
            rank: 1,
            chunk_id: 'abc',
            rel_path: 'KonvergenceCore/Controllers/AuthController.cs',
            symbol_name: 'Logout',
            symbol_type: 'method',
            start_line: 71,
            end_line: 95,
            score_vector: 0.65,
            score_bm25: 8.1,
            snippet: 'public IActionResult Logout(...)',
          },
        ],
      };

      service.query('endpoint logout').subscribe((res) => {
        expect(res).toEqual(expected);
      });

      const req = expectRequestEndingWith('/api/Rag/Query');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ query: 'endpoint logout', top_k: 8, use_lora: true });
      expect(req.request.withCredentials).toBe(true);
      req.flush(expected);
    });

    it('rispetta gli override topK e useLora', () => {
      service.query('test', { topK: 3, useLora: false }).subscribe();
      const req = expectRequestEndingWith('/api/Rag/Query');
      expect(req.request.body).toEqual({ query: 'test', top_k: 3, use_lora: false });
      req.flush({ results: [] });
    });

    it('queryAsync risolve in RagQueryResponse', async () => {
      const promise = service.queryAsync('test');
      const req = expectRequestEndingWith('/api/Rag/Query');
      req.flush({ results: [] });
      const res = await promise;
      expect(res).toEqual({ results: [] });
    });
  });

  describe('chat()', () => {
    it('POST /api/Rag/Chat con default top_k=5 e modello haiku-4-5', () => {
      const expected: RagChatResponse = {
        mode: 'rag-llm',
        answer: 'Il logout e\' gestito da AuthController.Logout',
        sources: [],
        warning: null,
        model: 'claude-haiku-4-5-20251001',
        tokens_in: 1234,
        tokens_out: 89,
      };

      service.chat('come funziona il logout?').subscribe((res) => {
        expect(res).toEqual(expected);
      });

      const req = expectRequestEndingWith('/api/Rag/Chat');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        query: 'come funziona il logout?',
        history: [],
        top_k: 5,
        model: 'claude-haiku-4-5-20251001',
      });
      expect(req.request.withCredentials).toBe(true);
      req.flush(expected);
    });

    it('inoltra history e supporta topK/model custom', () => {
      service
        .chat(
          'seconda domanda',
          [
            { role: 'user', content: 'prima' },
            { role: 'assistant', content: 'risposta' },
          ],
          { topK: 8, model: 'claude-sonnet-4-6' },
        )
        .subscribe();
      const req = expectRequestEndingWith('/api/Rag/Chat');
      expect(req.request.body).toEqual({
        query: 'seconda domanda',
        history: [
          { role: 'user', content: 'prima' },
          { role: 'assistant', content: 'risposta' },
        ],
        top_k: 8,
        model: 'claude-sonnet-4-6',
      });
      req.flush({ mode: 'rag-llm', answer: 'ok', sources: [] });
    });

    it('gestisce il fallback retrieval-only', () => {
      const expected: RagChatResponse = {
        mode: 'retrieval-only',
        answer: null,
        sources: [],
        warning: 'ANTHROPIC_API_KEY not set on the rag server; LLM disabled',
      };
      service.chat('test').subscribe((res) => {
        expect(res.mode).toBe('retrieval-only');
        expect(res.answer).toBeNull();
        expect(res.warning).toContain('ANTHROPIC_API_KEY');
      });
      const req = expectRequestEndingWith('/api/Rag/Chat');
      req.flush(expected);
    });
  });

  describe('health()', () => {
    it('GET /api/Rag/Health e parsifica RagHealthResponse', () => {
      const expected: RagHealthResponse = {
        status: 'ok',
        llm_enabled: true,
        docs_loaded: 5926,
        translate_cache_size: 626,
        loaded_at: 1775668840,
        default_model: 'claude-haiku-4-5-20251001',
      };
      service.health().subscribe((res) => {
        expect(res).toEqual(expected);
      });
      const req = expectRequestEndingWith('/api/Rag/Health');
      expect(req.request.method).toBe('GET');
      expect(req.request.withCredentials).toBe(true);
      req.flush(expected);
    });
  });

  describe('reload()', () => {
    it('POST /api/Rag/Reload con body vuoto', () => {
      service.reload().subscribe((res) => {
        expect(res.status).toBe('reloaded');
      });
      const req = expectRequestEndingWith('/api/Rag/Reload');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      expect(req.request.withCredentials).toBe(true);
      req.flush({ status: 'reloaded', docs_loaded: 5926, llm_enabled: false });
    });
  });
});
