import { MetadatiColonna } from "./metadati_colonna"

export class ValidationRule {
    column: MetadatiColonna;
    field: string;
    type: string;
    message: string;
    validationCallback?: Function;
    isValid: boolean;

    constructor() {

    }
}