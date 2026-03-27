import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DataSourceComponent } from 'wuic-framework-lib-src/component/data-source/data-source.component';
import { CommonModule } from '@angular/common';
import { CustomListComponent } from '../custom-list/custom-list.component';

@Component({
  selector: 'app-custom-cities-list',
  imports: [CommonModule, DataSourceComponent, CustomListComponent],
  templateUrl: './custom-cities-list.html',
  styleUrls: ['./custom-cities-list.css']
})
export class CustomCitiesListComponent implements OnInit {

  constructor(private titleService: Title) {

  }

  ngOnInit() {

  }

}


