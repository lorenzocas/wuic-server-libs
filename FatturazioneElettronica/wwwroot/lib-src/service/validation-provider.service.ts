import { Injectable } from '@angular/core';
import { MetaInfo } from '../class/metaInfo';
import { MetadatiColonna } from '../class/metadati_colonna';

@Injectable({
  providedIn: 'root'
})
export class ValidationProviderService {

  constructor() { }

  /**
   * Inizializza/ricarica il set di regole validazione del servizio.
   * Implementazione corrente volutamente vuota (hook per estensioni future).
   */
  setRules() {

  }

  /**
   * Punto di ingresso per validazione form-level basata su record e metadata tabella/colonne.
   * Implementazione corrente placeholder: non applica regole globali aggiuntive.
   * @param record Record corrente usato dalla logica/metadati.
   * @param metaInfo Metadati tabella/colonna usati dalla logica.
   */
  validateForm(record: any, metaInfo: MetaInfo) {

  }

  /**
   * Valida un singolo campo usando le regole presenti in `field.validationsRules`.
   * Al primo errore ritorna `{ valid: false, message }`, altrimenti `{ valid: true }`.
   * @param value Valore input da convertire/normalizzare.
   * @param field Metadato colonna/campo coinvolto nell'elaborazione.
   */
  validateField(value: any, field: MetadatiColonna) {
    if (field.validationsRules && field.validationsRules.length) {
      field.validationsRules.forEach((vr: any) => {
        let valid;
        if (vr.type == "required") {
          valid = (value !== undefined && value !== null && value !== "");
        }
        else if (vr.type == "pattern") {
          let regx = new RegExp(vr.column.mc_validation_pattern);
          valid = regx.test(value);
        }
        else if (vr.type == "type") {
          let type = vr.column.mc_validation_type;

          let pattern;

          switch (type) {

            case "email":
              pattern = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;
              break;

            case "url":
              pattern = /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i;
              break;

            case "creditcard":
              pattern = function (value: any) {
                // accept only spaces, digits and dashes
                if (/[^0-9 \-]+/.test(value)) {
                  return false;
                }
                let nCheck = 0,
                  nDigit = 0,
                  bEven = false;

                value = value.replace(/\D/g, "");

                for (let n = value.length - 1; n >= 0; n--) {
                  let cDigit = value.charAt(n);
                  nDigit = parseInt(cDigit, 10);
                  if (bEven) {
                    if ((nDigit *= 2) > 9) {
                      nDigit -= 9;
                    }
                  }
                  nCheck += nDigit;
                  bEven = !bEven;
                }

                return (nCheck % 10) === 0;
              }

              break;
          }

          if (pattern instanceof RegExp) {
            valid = pattern.test(value);
          } else {
            valid = false;
          }
        }
        else if (vr.type == "max_length") {
          valid = value && value.length <= vr.column.mc_validation_max_length;
        }
        else if (vr.type == "min_length") {
          valid = value && value.length >= vr.column.mc_validation_min_length;
        }

        return valid ? value : undefined;
      });
    }
  }
}
