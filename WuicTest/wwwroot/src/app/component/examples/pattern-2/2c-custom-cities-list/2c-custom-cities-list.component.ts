import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DataSourceComponent } from 'wuic-framework-lib-dev';
import { CommonModule } from '@angular/common';
import { CustomListComponent } from '../../../custom-list/custom-list.component';
import { FilterBarComponent } from 'wuic-framework-lib-dev';
import { PagerComponent } from 'wuic-framework-lib-dev';

/**
 * Pattern 2 — Framework data-layer + Custom component / esempio 2c.
 *
 * Wrappa `<app-custom-list>` (componente Angular "puro" reusabile che
 * implementa `IDataBoundHostComponent`) intorno al datasource WUIC
 * metadata-driven con `hardcodedRoute="cities"`. Dimostra come un componente
 * di rendering custom si aggancia al data layer del framework (paging,
 * filtering, sorting gestiti da `<wuic-data-source>`, `<wuic-filter-bar>`
 * e `<wuic-pager>`) senza rinunciare alla liberta' di layout custom.
 *
 * Alternativa architetturale rispetto a 2a (Cities cards) e 2b (KPI
 * dashboard) che invece implementano il rendering custom inline.
 */
@Component({
  selector: 'app-2c-custom-cities-list',
  imports: [CommonModule, DataSourceComponent, CustomListComponent, FilterBarComponent, PagerComponent],
  templateUrl: './2c-custom-cities-list.html',
  styleUrls: ['./2c-custom-cities-list.css']
})
export class Pattern2cCustomCitiesListComponent implements OnInit {

  constructor(private titleService: Title) {

  }

  ngOnInit() {

  }

}
