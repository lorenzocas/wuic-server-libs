import { MetadatiColonna } from "./metadati_colonna";
export declare class ValidationRule {
    column: MetadatiColonna;
    field: string;
    type: string;
    message: string;
    validationCallback?: Function;
    isValid: boolean;
    constructor();
}
//# sourceMappingURL=validationRule.d.ts.map