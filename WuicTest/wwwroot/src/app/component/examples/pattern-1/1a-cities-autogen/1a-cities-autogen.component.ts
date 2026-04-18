import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Pattern 1 — Full autogeneration / esempio 1a.
 *
 * Niente codice: la route metadata `cities` (presente in `_metadati__tabelle`
 * con archetype `list`) e' gia' renderizzata dal framework appena navighi a
 * `/cities/list`. Questo wrapper esiste solo per offrire un entry point
 * uniforme al pattern (8 esempi, ognuno in una cartella sotto `examples/`)
 * e per linkare la rotta auto-generata con un click.
 */
@Component({
  selector: 'app-1a-cities-autogen',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './1a-cities-autogen.component.html',
  styleUrl: './1a-cities-autogen.component.scss'
})
export class Pattern1aCitiesAutogenComponent {}
