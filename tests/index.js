//
const SessTable = require('../index').optimal

class lilDB {
    set_session_key_value;
    del_session_key_value;
    set_key_value;
    get_key_value;
    del_key_value;
    check_hash;
    constructor(spec) {
        let self = this;
        for (let [fn, lambda] of Object.entries(spec)) {
            self[fn] = lambda;
        }
    }
}
let db = new lilDB({
    set_session_key_value: (session_token, ownership_key) => {
        "";
    },
    del_session_key_value: async (session_token) => { return true; },
    set_key_value: (t_token, value) => { },
    get_key_value: (t_token) => { false; },
    del_key_value: (t_token) => { },
    check_hash: async (hh_unidentified, ownership_key) => { true; }
});



async function test() {
    let stoks = new SessTable(db);

    stoks.shutdown()
}


test()





/*

class lilDB implements DB {

    set_session_key_value : (session_token : SessionToken, ownership_key : Ucwid) => Hash;
    del_session_key_value : (session_token : SessionToken) => Promise<boolean>;
    set_key_value : (t_token : TransitionToken, value :string) => void;
    get_key_value : (t_token : TransitionToken) => Promise<string | boolean>;
    del_key_value : (t_token : TransitionToken) => void;
    check_hash  :   (hh_unidentified : string, ownership_key : Ucwid) => Promise<boolean>;

    constructor(spec) {
        let self = this
        for ( let [fn,lambda] of Object.entries(spec) ) {
            self[fn] = lambda
        }
    }

}

let db = new lilDB({
    set_session_key_value : (session_token : SessionToken, ownership_key : Ucwid) => { "" },
    del_session_key_value : async (session_token : SessionToken) =>  { return true },
    set_key_value : (t_token : TransitionToken, value :string) => {},
    get_key_value : (t_token : TransitionToken) => { false },
    del_key_value : (t_token : TransitionToken) => {},
    check_hash  :   async (hh_unidentified : string, ownership_key : Ucwid) => { true }
})


new LocalSessionTokens(db,default_token_maker)
*/