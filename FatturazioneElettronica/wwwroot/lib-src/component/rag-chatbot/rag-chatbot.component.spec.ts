// Test scritti per `@angular/build:unit-test` (vitest, runner di default del lib
// dalla migrazione karma->vitest in poi). describe/it/expect/vi sono globals via
// `tsconfig.spec.json` -> `types: ["vitest/globals"]`.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { WuicRagChatbotComponent } from './rag-chatbot.component';
import {
  RagChatResponse,
  RagHealthResponse,
  RagQueryResponse,
} from '../../service/wuic-rag.service';

describe('WuicRagChatbotComponent', () => {
  let fixture: ComponentFixture<WuicRagChatbotComponent>;
  let component: WuicRagChatbotComponent;
  let httpMock: HttpTestingController;

  function flushHealth(payload: Partial<RagHealthResponse> = {}): void {
    const reqs = httpMock.match((req) => req.url.endsWith('/api/Rag/Health'));
    expect(reqs.length).toBe(1);
    reqs[0].flush({
      status: 'ok',
      llm_enabled: true,
      docs_loaded: 5926,
      translate_cache_size: 626,
      loaded_at: 1775668840,
      default_model: 'claude-haiku-4-5-20251001',
      ...payload,
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, NoopAnimationsModule, WuicRagChatbotComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WuicRagChatbotComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('compila e crea il componente', () => {
    fixture.detectChanges();
    flushHealth();
    expect(component).toBeTruthy();
  });

  it('chiama health() in ngOnInit', () => {
    fixture.detectChanges();
    flushHealth({ llm_enabled: true });
    expect(component.healthInfo).toBeDefined();
    expect(component.healthInfo?.llm_enabled).toBe(true);
    httpMock.verify();
  });

  describe('effectiveMode', () => {
    it('mode=auto + llm_enabled=true -> rag-llm', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      expect(component.effectiveMode).toBe('rag-llm');
    });

    it('mode=auto + llm_enabled=false -> retrieval-only', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: false });
      expect(component.effectiveMode).toBe('retrieval-only');
    });

    it('mode=retrieval -> retrieval-only sempre, anche se llm_enabled=true', () => {
      component.mode = 'retrieval';
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      expect(component.effectiveMode).toBe('retrieval-only');
    });

    it('mode=chat -> rag-llm sempre (degrada lato backend)', () => {
      component.mode = 'chat';
      fixture.detectChanges();
      flushHealth({ llm_enabled: false });
      expect(component.effectiveMode).toBe('rag-llm');
    });
  });

  describe('modeBadgeLabel / modeBadgeSeverity', () => {
    it('mostra "RAG + LLM" + severity=success quando llm_enabled', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      expect(component.modeBadgeLabel).toBe('RAG + LLM');
      expect(component.modeBadgeSeverity).toBe('success');
    });

    it('mostra "retrieval" + severity=info quando llm disabilitato', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: false });
      expect(component.modeBadgeLabel).toBe('retrieval');
      expect(component.modeBadgeSeverity).toBe('info');
    });

    it('mostra "RAG offline" + severity=danger se health() fallisce', () => {
      fixture.detectChanges();
      const reqs = httpMock.match((req) => req.url.endsWith('/api/Rag/Health'));
      reqs[0].error(new ProgressEvent('network'), { status: 503, statusText: 'Service Unavailable' });
      expect(component.modeBadgeLabel).toBe('RAG offline');
      expect(component.modeBadgeSeverity).toBe('danger');
    });
  });

  describe('sendDisabled', () => {
    beforeEach(() => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
    });

    it('disabilitato quando inputValue e\' vuoto', () => {
      component.inputValue = '';
      expect(component.sendDisabled).toBe(true);
    });

    it('disabilitato quando inputValue e\' solo whitespace', () => {
      component.inputValue = '   \n\t  ';
      expect(component.sendDisabled).toBe(true);
    });

    it('abilitato con testo valido', () => {
      component.inputValue = 'come funziona il logout?';
      expect(component.sendDisabled).toBe(false);
    });

    it('disabilitato durante loading', () => {
      component.inputValue = 'test';
      component.loading = true;
      expect(component.sendDisabled).toBe(true);
    });

    it('disabilitato quando il backend RAG e\' offline', () => {
      component.inputValue = 'test';
      // forziamo healthError settandolo direttamente per evitare di rifare il flusso ngOnInit
      component['healthError'] = 'rag-server-unreachable';
      expect(component.sendDisabled).toBe(true);
    });
  });

  describe('onSend()', () => {
    it('aggiunge user turn + assistant turn alla history e chiama chat() in mode rag-llm', async () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      component.inputValue = 'come funziona il logout?';

      const sendPromise = component.onSend();

      // dopo onSend() partito, history ha gia' i 2 turni (user + assistant loading)
      expect(component.history.length).toBe(2);
      expect(component.history[0].role).toBe('user');
      expect(component.history[0].content).toBe('come funziona il logout?');
      expect(component.history[1].role).toBe('assistant');
      expect(component.history[1].loading).toBe(true);

      const chatReqs = httpMock.match((req) => req.url.endsWith('/api/Rag/Chat'));
      expect(chatReqs.length).toBe(1);
      const chatResponse: RagChatResponse = {
        mode: 'rag-llm',
        answer: 'Il logout e\' gestito da AuthController.Logout',
        sources: [
          { rank: 1, rel_path: 'KonvergenceCore/Controllers/AuthController.cs', symbol_name: 'Logout', snippet: '' },
        ],
        warning: null,
        model: 'claude-haiku-4-5-20251001',
        tokens_in: 1234,
        tokens_out: 89,
      };
      chatReqs[0].flush(chatResponse);

      await sendPromise;

      expect(component.history[1].loading).toBe(false);
      expect(component.history[1].content).toBe(chatResponse.answer);
      expect(component.history[1].sources?.length).toBe(1);
      expect(component.history[1].mode).toBe('rag-llm');
      expect(component.loading).toBe(false);
    });

    it('chiama query() in mode retrieval-only e produce summary testuale', async () => {
      component.mode = 'retrieval';
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      component.inputValue = 'test';

      const sendPromise = component.onSend();
      const queryReqs = httpMock.match((req) => req.url.endsWith('/api/Rag/Query'));
      expect(queryReqs.length).toBe(1);
      const queryResponse: RagQueryResponse = {
        results: [
          { rank: 1, rel_path: 'KonvergenceCore/Controllers/AuthController.cs', symbol_name: 'Logout', snippet: 'public IActionResult Logout(...)' },
          { rank: 2, rel_path: 'KonvergenceCore/MetaModel/_Metadati_methods.cs', symbol_name: 'logout', snippet: 'public static void logout(user user)' },
        ],
      };
      queryReqs[0].flush(queryResponse);

      await sendPromise;

      const assistantTurn = component.history[1];
      expect(assistantTurn.mode).toBe('retrieval-only');
      expect(assistantTurn.sources?.length).toBe(2);
      expect(assistantTurn.content).toContain('AuthController.cs::Logout');
      expect(assistantTurn.content).toContain('_Metadati_methods.cs::logout');
    });

    it('non fa nulla con input vuoto', async () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      component.inputValue = '   ';
      await component.onSend();
      expect(component.history.length).toBe(0);
      expect(httpMock.match((req) => req.url.includes('/api/Rag/')).length).toBe(0);
    });
  });

  describe('onSourceClick()', () => {
    it('emette resultSelected', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      const spy = vi.fn();
      component.resultSelected.subscribe(spy);
      const source = {
        rank: 1,
        rel_path: 'KonvergenceCore/Controllers/AuthController.cs',
        symbol_name: 'Logout',
        start_line: 71,
        end_line: 95,
        snippet: '',
      };
      component.onSourceClick(source);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(source);
    });
  });

  describe('sourceLabel() / sourceTooltip()', () => {
    it('label = filename::symbol', () => {
      const s = { rank: 1, rel_path: 'KonvergenceCore/Controllers/AuthController.cs', symbol_name: 'Logout', snippet: '' };
      expect(component.sourceLabel(s)).toBe('AuthController.cs::Logout');
    });

    it('label = filename quando symbol mancante', () => {
      const s = { rank: 1, rel_path: 'KonvergenceCore/Controllers/AuthController.cs', symbol_name: null, snippet: '' };
      expect(component.sourceLabel(s)).toBe('AuthController.cs');
    });

    it('tooltip include path completo + linee', () => {
      const s = {
        rank: 1,
        rel_path: 'KonvergenceCore/Controllers/AuthController.cs',
        symbol_name: 'Logout',
        start_line: 71,
        end_line: 95,
        snippet: '',
      };
      expect(component.sourceTooltip(s)).toContain('KonvergenceCore/Controllers/AuthController.cs');
      expect(component.sourceTooltip(s)).toContain('71-95');
    });
  });

  describe('onKeyDown', () => {
    it('Enter senza shift triggera onSend()', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      component.inputValue = 'test';
      const onSendSpy = vi.spyOn(component, 'onSend');
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      component.onKeyDown(event);
      expect(onSendSpy).toHaveBeenCalled();
    });

    it('Shift+Enter NON triggera onSend()', () => {
      fixture.detectChanges();
      flushHealth({ llm_enabled: true });
      component.inputValue = 'test';
      const onSendSpy = vi.spyOn(component, 'onSend');
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
      component.onKeyDown(event);
      expect(onSendSpy).not.toHaveBeenCalled();
    });
  });
});
