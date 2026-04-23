import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss'
})
export class Privacy {}
