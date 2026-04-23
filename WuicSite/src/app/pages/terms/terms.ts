import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-terms',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './terms.html',
  styleUrl: './terms.scss'
})
export class Terms {}
