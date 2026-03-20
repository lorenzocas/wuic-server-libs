export declare class MetadatiConditionGroup {
    __user_id: number;
    CG_Id: number;
    CG_Name: string;
    md_id: number;
    CI_Id: number;
    CI_Evaluation_Trigger: 0 | 1;
    CI_Comparison_Left_Field: string;
    CI_Comparison_Operator: string;
    CI_Comparison_Right_Field: string;
    CI_Formula: string;
    CI_Enabled: boolean;
    ConditionActions: MetadatiConditionGroupAction[];
    constructor();
}
export declare class MetadatiConditionGroupAction {
    __user_id: number;
    CAG_Id: number;
    CAG_Name: string;
    FK_CG_Id: number;
    CAG_Execute_If_False?: boolean;
    CAI_Id: number;
    FK_CAG_Id: number;
    CAI_Target_Field: string;
    CAI_Target_Action: '0' | '1' | '2' | '3' | '4' | '5';
    CAI_Target_Action_Param_Value: string;
    CAI_Formula: string;
    CAI_Enabled: boolean;
    constructor();
}
//# sourceMappingURL=metadati_condition_group.d.ts.map