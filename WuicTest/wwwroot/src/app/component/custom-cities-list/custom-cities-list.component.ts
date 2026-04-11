import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DataSourceComponent } from 'wuic-framework-lib-dev';
import { CommonModule } from '@angular/common';
import { CustomListComponent } from '../custom-list/custom-list.component';
import { FilterBarComponent } from 'wuic-framework-lib-dev';
import { PagerComponent } from 'wuic-framework-lib-dev';

@Component({
  selector: 'app-custom-cities-list',
  imports: [CommonModule, DataSourceComponent, CustomListComponent, FilterBarComponent, PagerComponent],
  templateUrl: './custom-cities-list.html',
  styleUrls: ['./custom-cities-list.css']
})
export class CustomCitiesListComponent implements OnInit {

  constructor(private titleService: Title) {

  }

  ngOnInit() {

  }

}






