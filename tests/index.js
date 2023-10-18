//
const SessTable = require('../index').optimal


let conf = {
    _key_values_test : false,
    set_session_key_value: (session_token, ownership_key) => {
        let obj = {
            "sess" : session_token,
            "own" : ownership_key
        }
        return JSON.stringify(obj)
    },
    del_session_key_value: async (session_token) => { return true; },
    set_key_value: (t_token, value) => { 
        console.log(`set_key_value: ${t_token}`)
        console.dir(value)
        conf._key_values_test[t_token] = value
        return;  // void
    },
    get_key_value: (t_token) => {
        let value = conf._key_values_test[t_token]
        return value
    },
    del_key_value: (t_token) => { 
        delete conf._key_values_test[t_token]
    },
    check_hash: async (hh_unidentified, ownership_key) => { return true; }
}


class lilDB {  // a mock that provides the DB interface
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
        spec._key_values_test = this._key_values_test = {}
    }
}




//
let db = new lilDB(conf);




async function test1() {
    let stoks = new SessTable(db);

    // console.dir(stoks)
    //
    console.log("--------------------------------------------")
    let sess = stoks.create_token('session-')
    let t_token = stoks.create_token('transition-')
    console.log(sess,t_token)

    let check_key = await stoks.add_session(sess,"IAMOWNER",t_token,true)
    console.log("check_key:",check_key,"\n--------")

    console.log("_key_values_test:")
    console.dir(stoks._db._key_values_test)
    console.log("_token_to_information:")
    console.dir(stoks._token_to_information)
    console.log("_token_timing:")
    console.dir(stoks._token_timing)
    //
    console.log(stoks._token_to_information.get(t_token))
    console.log(stoks._token_timing.get(t_token))
    //
    console.log("_session_to_owner:")
    console.dir(stoks._session_to_owner)
    console.log("_session_checking_tokens:")
    console.dir(stoks._session_checking_tokens)
    console.log("_token_to_owner:")
    console.dir(stoks._token_to_owner)
    console.log("_sessions_to_their_tokens:")
    console.dir(stoks._sessions_to_their_tokens)
    //
    stoks.destroy_session(t_token)
    //
    console.log("(delete) _key_values_test:")
    console.dir(stoks._db._key_values_test)
    console.log("(delete) _token_to_information:")
    console.dir(stoks._token_to_information)
    console.log("(delete) _token_timing:")
    console.dir(stoks._token_timing)
    //
    console.log(stoks._token_to_information.get(t_token))
    console.log(stoks._token_timing.get(t_token))
    //
    console.log("(delete) _session_to_owner:")
    console.dir(stoks._session_to_owner)
    console.log("(delete) _session_checking_tokens:")
    console.dir(stoks._session_checking_tokens)
    console.log("(delete) _token_to_owner:")
    console.dir(stoks._token_to_owner)
    console.log("(delete) _sessions_to_their_tokens:")
    console.dir(stoks._sessions_to_their_tokens)
    //

    stoks.shutdown()
}




async function test2() {
    let stoks = new SessTable(db);
    //
    stoks.set_general_token_timeout(600)
    stoks.set_general_session_timeout(900)

    // console.dir(stoks)
    //
    console.log("1--------------------------------------------")
    let sess = stoks.create_token('session-')
    let t_token = stoks.create_token('transition-')
    console.log(sess,t_token)

    let ownership_key = "IAMOWNER"

    let check_key = await stoks.add_session(sess,ownership_key,t_token,true)
    console.log("check_key:",check_key,"\n--------")

    console.log("_key_values_test:")
    console.dir(stoks._db._key_values_test)
    console.log("_token_to_information:")
    console.dir(stoks._token_to_information)
    console.log("_token_timing:")
    console.dir(stoks._token_timing)
    //
    console.log(stoks._token_to_information.get(t_token))
    console.log(stoks._token_timing.get(t_token))
    //
    console.log("_session_to_owner:")
    console.dir(stoks._session_to_owner)
    console.log("_session_checking_tokens:")
    console.dir(stoks._session_checking_tokens)
    console.log("_token_to_owner:")
    console.dir(stoks._token_to_owner)
    console.log("_sessions_to_their_tokens:")
    console.dir(stoks._sessions_to_their_tokens)
    //
    let is_active = await stoks.active_session(sess, ownership_key)
    console.log("session is active (true if check_hash returns true):",is_active)
    //

    console.log("2--------------------------------------------")
    let tr_token = stoks.create_token('transition-')
    //
    let value = { "test" : "yes", "more" : "this" }
    await stoks.add_session_bounded_token(tr_token, value, ownership_key)

    let tr2_token = stoks.create_token('transition-')
    value = { "test" : "yes", "more" : "can be transfered" }
    await stoks.add_transferable_token(tr2_token, value, ownership_key)    // transferable

    if ( stoks.token_is_transferable(tr2_token)  ) {
        console.log("TOKEN IS TRANSFERABLE")
    }

    stoks.set_session_timeout(sess,700)
    let sess_tout = stoks.get_session_timeout(sess)

    if ( sess_tout == 700 ) {
        console.log("VERIFIED SESS TIMEOUT")
    }

    stoks.set_token_timeout(t_token,800)
    let ttimeout = stoks.get_token_timeout(t_token)
    let tleft = stoks.get_token_time_left(t_token)
    console.log("ttimeout:",ttimeout,t_token,"T_left",tleft)
    //
    console.log("SESSION TIME LEFT",stoks.get_session_time_left(sess))   /// DECREMENT TIMERS
    stoks.decrement_timers()
    //
    //
    tleft = stoks.get_token_time_left(t_token)
    console.log("ttimeout (after):",ttimeout,t_token,"T_left",tleft)
    //
    stoks.allow_session_detach(sess)
    stoks.detach_session(sess)
    console.dir(await stoks.list_detached_sessions())
    //
    stoks.attach_session(sess)
    stoks.set_disownment_token_timeout(tr2_token, 500)

    // SELLABLE TOKEN
    stoks.set_token_sellable(tr2_token, 2.15)


    let hash_of_p2 = "sdjsfsoijfsfosijf"

    stoks.reload_session_info(sess, ownership_key, hash_of_p2) 
    stoks.reload_token_info(t_token)

    console.log("_key_values_test:")
    console.dir(stoks._db._key_values_test)
    console.log("_token_to_information:")
    console.dir(stoks._token_to_information)
    console.log("_token_timing:")
    console.dir(stoks._token_timing)
    //
    console.log("tr_token:",stoks._token_to_information.get(tr_token))
    console.log("tr_token:",stoks._token_timing.get(tr_token))
    //
    console.log("_session_to_owner:")
    console.dir(stoks._session_to_owner)
    console.log("_session_checking_tokens:")
    console.dir(stoks._session_checking_tokens)
    console.log("_token_to_owner:")
    console.dir(stoks._token_to_owner)
    console.log("_sessions_to_their_tokens:")
    console.dir(stoks._sessions_to_their_tokens)
    //
    //
    console.log("list_tranferable_tokens:")
    console.dir(await stoks.list_tranferable_tokens(sess))
    console.log("list_sellable_tokens:")
    console.dir(await stoks.list_sellable_tokens())
    console.log("list_unassigned_tokens:")
    console.dir(await stoks.list_unassigned_tokens())
    console.log("list_detached_sessions:")
    console.dir(await stoks.list_detached_sessions())
    //
    console.log("map_sellable_tokens:")
    console.dir(await stoks.map_sellable_tokens())

    //
    console.log("3--------------------------------------------")
    //
    stoks.destroy_session(t_token)
    //
    console.log("(delete) _key_values_test:")
    console.dir(stoks._db._key_values_test)
    console.log("(delete) _token_to_information:")
    console.dir(stoks._token_to_information)
    console.log("(delete) _token_timing:")
    console.dir(stoks._token_timing)
    //
    console.log(stoks._token_to_information.get(t_token))
    console.log(stoks._token_timing.get(t_token))
    //
    console.log("(delete) _session_to_owner:")
    console.dir(stoks._session_to_owner)
    console.log("(delete) _session_checking_tokens:")
    console.dir(stoks._session_checking_tokens)
    console.log("(delete) _token_to_owner:")
    console.dir(stoks._token_to_owner)
    console.log("(delete) _sessions_to_their_tokens:")
    console.dir(stoks._sessions_to_their_tokens)

    console.log("(delete) _orphaned_tokens:")
    console.dir(stoks._orphaned_tokens)

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    stoks.unset_token_sellable(tr2_token) 

    console.log("(delete) list_unassigned_tokens:")
    console.dir(await stoks.list_unassigned_tokens())

    
    //

    stoks.shutdown()
}



async function test() {
    await test1()
    await test2()
}

test()

