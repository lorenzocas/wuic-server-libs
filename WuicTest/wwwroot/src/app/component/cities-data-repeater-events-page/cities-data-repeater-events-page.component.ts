import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataRepeaterComponent, DataSourceComponent } from 'wuic-framework-lib-dev';
import { BehaviorSubject, Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-data-repeater-events-page',
  imports: [CommonModule, DataSourceComponent, DataRepeaterComponent],
  templateUrl: './cities-data-repeater-events-page.component.html',
  styleUrls: ['./cities-data-repeater-events-page.component.css']
})
export class CitiesDataRepeaterEventsPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataRepeaterComponent) repeater?: DataRepeaterComponent;

  private readonly subs = new Subscription();
  readonly eventLog: string[] = [];
  readonly actionOptions: string[] = ['list', 'chart', 'spreadsheet', 'map'];
  readonly action$ = new BehaviorSubject<string>('list');
  selectedAction: string = 'list';

  ngAfterViewInit(): void {
    const repeater = this.repeater;
    if (!repeater) {
      return;
    }

    this.subs.add(
      repeater.templateReady.subscribe((action: string) => {
        this.pushLog(`templateReady: ${action}`);
      })
    );

    this.subs.add(
      repeater.archetypeInstanceReady.subscribe((event: { archetype: string; instance: any }) => {
        this.pushLog(`archetypeInstanceReady: ${event.archetype}`);
        console.debug('[CitiesDataRepeaterEventsPage] renderedArchetypeInstance', repeater.renderedArchetypeInstance);
        console.debug('[CitiesDataRepeaterEventsPage] getRenderedArchetypeViewChild', repeater.getRenderedArchetypeViewChild<any>());
      })
    );

    this.subs.add(
      repeater.archetypeEvent.subscribe((event: { archetype: string; eventName: string; payload: any; instance: any }) => {
        this.pushLog(`archetypeEvent: ${event.archetype}.${event.eventName}`);
      })
    );

    this.subs.add(
      repeater.archetypeDataBound.subscribe((event: { archetype: string; eventName: string; payload: any; instance: any }) => {
        this.pushLog(`archetypeDataBound: ${event.archetype}.${event.eventName}`);
      })
    );

    setTimeout(() => {
      console.debug('[CitiesDataRepeaterEventsPage] initial renderedArchetypeInstance', repeater.renderedArchetypeInstance);
    }, 0);
  }

  onActionSelectChange(event: Event): void {
    const nextAction = (event.target as HTMLSelectElement | null)?.value || 'list';
    this.selectedAction = nextAction;
    this.action$.next(nextAction);
    this.pushLog(`actionChanged: ${nextAction}`);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private pushLog(message: string): void {
    this.eventLog.unshift(`${new Date().toLocaleTimeString()} - ${message}`);
    if (this.eventLog.length > 20) {
      this.eventLog.length = 20;
    }
  }
}

