import { Lingua } from "./lingua";

export class UserInfo {
    user_id: number;
    user_name: string;
    display_name: string;
    role: string;
    role_id: number;
    isAdmin: boolean;
    /**
     * Flag `superadmin` del ruolo dell'utente (tabella `ruoli`, colonna
     * `superadmin`). E' la fonte di verita' per `isUserAdmin`: `isAdmin`
     * resta esposto come flag storico sull'utente ma non va piu' usato
     * per decisioni di autorizzazione lato UI.
     */
    isSuperAdmin: boolean;
    lingua: Lingua;
    language?: string;
    optimisticCheckEnabled?: boolean;

    constructor(params: { user_id: number, user_name: string, display_name: string, role: string, role_id: number, isAdmin: boolean, isSuperAdmin?: boolean, lingua: Lingua, language?: string, optimisticCheckEnabled?: boolean }) {
        this.user_id = params.user_id;
        this.user_name = params.user_name;
        this.display_name = params.display_name;
        this.role = params.role;
        this.role_id = params.role_id;
        this.isAdmin = !!params.isAdmin;
        this.isSuperAdmin = !!params.isSuperAdmin;
        this.lingua = params.lingua;
        this.language = params.language || params.lingua?.id;
        this.optimisticCheckEnabled = params.optimisticCheckEnabled;
    }
}
