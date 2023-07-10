// 
//
use std::str;
use fastuuid::Generator;
use std::collections::{HashSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{Result,to_string};


use derive_builder::Builder;

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


type Hash = String;
type SessionToken = String;
type TransitionToken = String;
type Ucwid = String;

#[derive(Debug)]
#[derive(Hash)]
#[derive(Eq, PartialEq)]
pub enum Token {
    SessionToken(SessionToken),
    TransitionToken(TransitionToken)
}

pub enum StructOrString<T> {
    TypeA(String),
    TypeB(T),
}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

#[allow(non_camel_case_types)]
type token_lambda = Box<fn (Option<&str>) -> Token>;

// ---- ----

const SESSION_PEFIX : &str = "user+";

const MINUTES : u32 = 1000*60;
const GENERAL_DEFAULT_SESSION_TIMEOUT : u32 = 60*MINUTES;
const SESSION_CHOP_INTERVAL : u32 = 500;


// ---- ----

pub trait SessionTokenTraits {
    fn new() -> Self;
    fn clear(&mut self) -> ();
}


/*
#![feature(async_fn_in_trait)]

trait Database {
    async fn fetch_data(&self) -> String;
}

impl Database for MyDb {
    async fn fetch_data(&self) -> String { ... }
}
*/

pub trait DB {
    fn set_session_key_value(&self, session_token : & SessionToken, ownership_key : Ucwid ) -> Hash;
    fn del_session_key_value(&self, session_token : & SessionToken ) -> bool;
    fn set_key_value(&self, token : & TransitionToken, value : &str )  -> ();
    fn get_key_value(&self, token : & TransitionToken )  -> Option<&str>;
    fn del_key_value(&self, token : & TransitionToken )  -> ();
    fn check_hash(&self, hh_unidentified : &str, ownership_key : Ucwid )  -> bool;
}


pub trait TokenTables {
    type Jsonable;
    //
    fn new(db : Box<dyn DB>, token_creator : Option<token_lambda>) -> Self;
    //
    fn decrement_timers(&mut self) -> ();
    fn set_token_creator(&mut self, token_creator : Option<token_lambda>) -> ();
    //
    fn add_session(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, o_t_token : Option<TransitionToken>, shared : Option<bool> ) -> Option<Hash>;
    fn active_session(&self, session_token : & SessionToken, ownership_key : & Ucwid) -> Option<bool>;
    fn destroy_session(&mut self, token : & TransitionToken) -> ();
    fn allow_session_detach(&mut self, session_token : SessionToken) -> ();
    fn detach_session(&mut self, session_token : SessionToken) -> ();
    fn attach_session(&mut self, session_token : SessionToken) -> ();
    //
    fn create_token(&self, prefix : Option<String> ) -> Token;
    fn add_token(&mut self, token : TransitionToken, value : StructOrString<Self::Jsonable> ) -> ();
    fn transition_token_is_active(&mut self, token : TransitionToken) -> Option<String>;
    fn destroy_token(&mut self, token : & TransitionToken) -> ();
    fn from_token(&self, token : TransitionToken) -> Ucwid;

    fn add_transferable_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid ) -> ();
    fn transfer_token(&mut self,  t_token : & TransitionToken, yielder_key : & Ucwid,  receiver_key : & Ucwid )  -> ();
}

/*
interface LocalSessionTokensAbstract {
    //
    create_token : ( prefix? : string ) => Token
    add_token : (t_token : TransitionToken, value : string | object ) => Promise<void>
    transition_token_is_active : (t_token : TransitionToken) =>  Promise<boolean | string>
    from_token : (t_token : TransitionToken) => Ucwid
    add_transferable_token : ( t_token : TransitionToken, value : string | object, ownership_key : Ucwid ) => Promise<void>
    add_session_bounded_token : ( t_token : TransitionToken, value : string | object, ownership_key : Ucwid ) => Promise<void>
    acquire_token : (t_token : TransitionToken, session_token : SessionToken, owner : Ucwid) => Promise<boolean>
    token_is_transferable : (t_token : TransitionToken)  =>  boolean
    transfer_token : ( t_token : TransitionToken, yielder_key : Ucwid,  receiver_key : Ucwid ) => void
    destroy_token : (t_token : TransitionToken) => void
    //
    set_general_session_timeout : (timeout : Number) => void
    set_session_timeout : (session_token : SessionToken,timeout : Number) => void
    get_session_timeout : (session_token : SessionToken) => Number | undefined
    get_session_time_left : (session_token : SessionToken) => Number | undefined
    //
    set_general_token_timeout : (timeout : Number) => void
    set_disownment_token_timeout : (t_token : TransitionToken,timeout : Number) => void
    set_token_timeout : (t_token : TransitionToken,timeout : Number) => void
    get_token_timeout : (t_token : TransitionToken)  =>  Number | undefined 
    set_token_sellable : (t_token : TransitionToken, amount? : Number) => void
    unset_token_sellable : (t_token : TransitionToken) => void
    //
    reload_session_info(session_token : SessionToken, ownership_key : Ucwid, hash_of_p2 : Hash) : Promise<boolean> 
    reload_token_info(t_token : TransitionToken) : Promise<void>
    //
    list_tranferable_tokens : (session_token : SessionToken) => TransitionToken[]
    list_sellable_tokens : () => TransitionToken[]
    list_unassigned_tokens : () => TransitionToken[]
    list_detached_sessions : () => SessionToken[]
}

*/

// ---- ----


fn gen_random_str() -> String {
    let g_generator : Generator = Generator::new();
    g_generator.hex128_as_string().unwrap()
}

#[allow(non_upper_case_globals)]
fn default_token_maker(prefix : Option<&str>) -> Token {
    //
    let rstr : String = gen_random_str();    //  : &str
    //
    let token : Token;
    match prefix {
        Some(prfx) => {
            let stoken : String = prfx.to_owned() + rstr.as_str();
            if prfx == SESSION_PEFIX {
                token = Token::SessionToken(stoken);
            } else {
                token = Token::TransitionToken(stoken);
            }
        },
        None => {
            token = Token::TransitionToken(rstr);
        }
    };
    token
}



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

#[derive(Clone)]
struct SessionTokenSets {
    session_bounded : HashSet<TransitionToken>,
    session_carries : HashSet<TransitionToken>
}


impl SessionTokenTraits for SessionTokenSets {
    fn new() -> SessionTokenSets {
        let bounded = HashSet::new();
        let carries = HashSet::new();
        SessionTokenSets { session_bounded : bounded, session_carries : carries }
    }
    fn clear(&mut self) -> () {
        self.session_bounded.clear();
        self.session_carries.clear();
    }
}






/**
 * Transferable tokens may be moved to another owner at any time a session owner allows it.
 * By virue of being in a set of transferable tokens, the token is tansferable. 
 * The token may additionally be sellable at some price, which may positive or negative.
 * Other useful properties may be added later that apply only to transferable tokens.
 */
#[derive(Clone)]
#[derive(Builder)]
struct TransferableTokenInfo {
    #[builder(default = "false")]
    _sellable : bool,
    #[builder(default = "0.0")]
    _price: f32,
    _owner : Ucwid,
}

impl TransferableTokenInfo {
    //
    fn set_all(&mut self, stored_info : serde_json::Value) -> () {
        let s1 = stored_info["_sellable"].clone();
        let s2 = stored_info["_price"].clone();
        self._sellable = serde_json::from_value(s1).unwrap();
        self._price = serde_json::from_value(s2).unwrap();
        self._owner = stored_info["_owner"].to_string();
    }
}


/**
 * There are several situations in which a sesion may be used in a time-sensitive way.
 * This class puts them in a single record for storage in a sinlge local table. 
 * Many times, a token's timing roles may be manipulated at once. Hence, keeping the token in a table for each case
 * will increase the algorithmic time a token's updates will require.
*/

#[derive(Clone)]
#[derive(Builder)]
#[derive(Serialize, Deserialize)]
struct SessionTimingInfo {
    #[builder(default = "false")]
    _detachment_allowed : bool,
    #[builder(default = "false")]
    _is_detached : bool,  // a session is detached when its owner has logged out but returning is allowed
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_left : u32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_left_after_detachment : u32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_allotted : u32,
    #[builder(default = "false")]
    _shared : bool,
 }

impl SessionTimingInfo {
    //
    fn set_all(&mut self, stored_info : serde_json::Value) -> () {
        self._detachment_allowed = serde_json::from_value(stored_info["_detachment_allowed"].clone()).unwrap();
        self._is_detached = serde_json::from_value(stored_info["_is_detached"].clone()).unwrap();
        self._time_left = serde_json::from_value(stored_info["_time_left"].clone()).unwrap();
        self._time_left_after_detachment = serde_json::from_value(stored_info["_time_left_after_detachment"].clone()).unwrap();
        self._time_allotted = serde_json::from_value(stored_info["_time_allotted"].clone()).unwrap();
        self._shared = serde_json::from_value(stored_info["_shared"].clone()).unwrap();
    }
}



/**
 * There are several situations in which a token may be used in a time-sensitive way.
 * This class puts them in a single record for storage in a sinlge local table. 
 * Many times, a token's timing roles may be manipulated at once. Hence, keeping the token in a table for each case
 * will increase the algorithmic time a token's updates will require.
 */
 #[derive(Clone)]
#[derive(Builder)]
struct TokenTimingInfo {
    #[builder(default = "false")]
    _detachment_allowed : bool,
    #[builder(default = "false")]
    _is_detached : bool,  // a session is detached when its owner has logged out but returning is allowed
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_left : u32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_left_after_detachment : u32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_allotted : u32,
 }

impl TokenTimingInfo {
    //
    fn set_all(&mut self, stored_info : serde_json::Value) -> () {
        self._detachment_allowed = serde_json::from_value(stored_info["_detachment_allowed"].clone()).unwrap();
        self._is_detached = serde_json::from_value(stored_info["_is_detached"].clone()).unwrap();
        self._time_left = serde_json::from_value(stored_info["_time_left"].clone()).unwrap();
        self._time_left_after_detachment = serde_json::from_value(stored_info["_time_left_after_detachment"].clone()).unwrap();
        self._time_allotted = serde_json::from_value(stored_info["_time_allotted"].clone()).unwrap();
    }
}



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


struct LocalSessionTokens {
    //
    _db : Box<dyn DB>,
    //
    _session_to_owner : HashMap<SessionToken,Ucwid>,
    _owner_to_session : HashMap<Ucwid,SessionToken>,  
    _token_to_owner : HashMap<Token,Ucwid>,                         // map to owner -- token belongs to owner (Ucwid)
    _token_to_session : HashMap<TransitionToken,SessionToken>,
    _session_checking_tokens : HashMap<SessionToken,String>,
    _token_to_information : HashMap<TransitionToken,String>,
    _sessions_to_their_tokens :  HashMap<SessionToken,SessionTokenSets>,
    _detached_sessions : HashSet<SessionToken>,
    _orphaned_tokens : HashSet<TransitionToken>,
    //
    _session_timing : HashMap<SessionToken, SessionTimingInfo>,
    _all_tranferable_tokens : HashMap<TransitionToken,TransferableTokenInfo>,
    _token_timing : HashMap<TransitionToken,TokenTimingInfo>,
    //
    _token_creator : token_lambda,
    //
    _general_session_timeout : u32,
    _session_time_chopper : u32,
    _general_token_timeout : u32,
}



impl TokenTables for LocalSessionTokens {
    type Jsonable = serde_json::Value;
    //
    fn new(db : Box<dyn DB>, token_creator : Option<token_lambda>) -> LocalSessionTokens {
        let s_to_o = HashMap::<SessionToken,Ucwid>::new();
        let o_to_s = HashMap::<Ucwid,SessionToken>::new();
        let t_to_o = HashMap::<Token,Ucwid>::new();
        let t_to_s = HashMap::<TransitionToken,SessionToken>::new();
        let s_c_t = HashMap::<SessionToken,String>::new();
        let t_to_i = HashMap::<TransitionToken,String>::new();
        let s_to_t = HashMap::<SessionToken,SessionTokenSets>::new();
        let d_s = HashSet::<SessionToken>::new();
        let o_t = HashSet::<TransitionToken>::new();
        let s_t = HashMap::<SessionToken,SessionTimingInfo>::new();
        let a_t_t = HashMap::<TransitionToken,TransferableTokenInfo>::new();
        let t_t = HashMap::<TransitionToken,TokenTimingInfo>::new();
        //
        let tl : token_lambda;
        match token_creator {
            Some(app_tl) => {
                tl = app_tl;
            },
            None => {
                tl = Box::new(default_token_maker);
            }
        }
        let general_session_timeout = GENERAL_DEFAULT_SESSION_TIMEOUT;
        //
        //
        LocalSessionTokens {
            _db : db,
            _session_to_owner : s_to_o,
            _owner_to_session : o_to_s,  
            _token_to_owner : t_to_o,
            _token_to_session : t_to_s,
            _session_checking_tokens : s_c_t,
            _token_to_information : t_to_i,
            _sessions_to_their_tokens :  s_to_t,
            //
            _detached_sessions : d_s,
            _orphaned_tokens : o_t,
            //
            _session_timing : s_t,
            _all_tranferable_tokens : a_t_t,
            _token_timing : t_t,
        
            _token_creator : tl,
            _general_session_timeout : general_session_timeout,
            _session_time_chopper : 0,
            _general_token_timeout : u32::MAX,
        }
    }



    fn decrement_timers(&mut self) -> () {
/*
        for ( let [sess_tok,time_info] of Object.entries(this._session_timing) ) {
            if ( time_info._is_detached ) {
                let time_left = time_info._time_left_after_detachment
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._session_timing.delete(sess_tok)
                    this.destroy_token(sess_tok)
                } else {
                    time_info._time_left_after_detachment = time_left
                }
            } else {
                let time_left = time_info._time_left
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._session_timing.delete(sess_tok)
                    this.destroy_token(sess_tok)
                }  else {
                    time_info.time_left = time_left
                }
            }
            //
            if ( time_info.shared ) { // session information only
                (async () => {  // update this shared information
                    await this._db.set_key_value(sess_tok,JSON.stringify(time_info))
                })()    
            }
        }
        for ( let [t_tok,time_info] of Object.entries(this._token_timing) ) {
            if ( time_info._is_detached ) {
                let time_left = time_info._time_left_after_detachment
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._token_timing.delete(t_tok)
                    this.destroy_token(t_tok)
                } else {
                    time_info._time_left_after_detachment = time_left
                }
            } else {
                let time_left = time_info._time_left
                time_left -= SESSION_CHOP_INTERVAL;
                if ( time_left <= 0 ) {
                    this._token_timing.delete(t_tok)
                    this.destroy_token(t_tok)
                }  else {
                    time_info.time_left = time_left
                }
            }
        }
*/
    }

    fn set_token_creator(&mut self, token_creator : Option<token_lambda>) -> () {
        self._token_creator = token_creator.unwrap();
    }

    fn add_session(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, o_t_token : Option<TransitionToken>, shared :  Option<bool>) -> Option<Hash> {
        let hash_of_p2 = self._db.set_session_key_value(&session_token,ownership_key.to_string());  // await
        self._session_to_owner.insert(session_token.to_string(),ownership_key.to_string());
        self._session_checking_tokens.insert(session_token.to_string(),hash_of_p2.to_string());
        let st = Token::SessionToken(session_token.to_string());
        self._token_to_owner.insert(st,ownership_key.to_string());
        let mut sess_token_set = SessionTokenSets::new();
        //
        match o_t_token {
            Some(t_token) => {
                self._token_to_session.insert(t_token.to_string(), session_token.to_string());
                sess_token_set.session_bounded.insert(t_token.to_string());
                //
                let tt = Token::TransitionToken(t_token.to_string());
                self._token_to_owner.insert(tt,ownership_key.to_string());
                let owk = StructOrString::TypeA(hash_of_p2.to_string());
                self.add_token(t_token, owk);
            }
            _ => ()
        }
        self._sessions_to_their_tokens.insert(session_token.to_string(),sess_token_set);
        //
        let mut sti = SessionTimingInfoBuilder::default().build().ok()?;
        //
        let result = match shared {
            Some(share_chk) => {
                if share_chk {
                    sti._shared = true;
                    let value = serde_json::to_string(&sti).ok()?;
                    self._db.set_key_value(&session_token,value.as_str());    // await 
                    Some(hash_of_p2)
                } else {
                    None
                }
            }
            _ => None
        };
        //
        self._session_timing.insert(session_token.to_string(),sti);
        result
    }

    fn active_session(&self, session_token : & SessionToken, ownership_key : & Ucwid) -> Option<bool> {
        //
        match self._session_checking_tokens.get(session_token) {
            Some(hh_unidentified) => {
                let hh_str : & str = hh_unidentified.as_str();
                let truth = self._db.check_hash(hh_str,ownership_key.to_string()); // await
                Some(truth)
            }
            _ => Some(false)
        }
    }


    fn destroy_session(&mut self, token : & TransitionToken) -> () {
        //
        match self._token_to_session.get(token) {
            Some(session_token) => {
                self._session_to_owner.remove(session_token); // the session transition token 
                self._session_checking_tokens.remove(session_token);
                let t = Token::TransitionToken(token.to_string());
                self._token_to_owner.remove(&t);
                self._sessions_to_their_tokens.remove(session_token);
                self._db.del_session_key_value(session_token);
            }
            _ => ()
        }
        //
    }
/*
    this.attach_session(session_token) // if it might be in the set of detached sessions.
    //
    this._session_to_owner.delete(session_token) // the session transition token 
    this._session_checking_tokens.delete(session_token)

    let time_info = this._session_timing.get(session_token)
    this._session_timing.delete(session_token)
    //
    if ( time_info && time_info._shared ) {
        (async () => {  // update this shared information
            await this._db.del_key_value(session_token)
        })()    
    }
    //
    let token_sets : SessionTokenSets | undefined = this._sessions_to_their_tokens.get(session_token)
    if ( token_sets !== undefined ) {
        for ( let token in token_sets.session_carries ) {
            this._orphaned_tokens.add(token)            // orphaned
        }
        for ( let token in token_sets.session_bounded ) {
            this.destroy_token(token)
        }
    }
    this._sessions_to_their_tokens.delete(session_token);
    //
    this._db.del_session_key_value(session_token)

*/


    fn allow_session_detach(&mut self, session_token : SessionToken) -> () {
        match self._session_timing.get_mut(&session_token) {
            Some(s_time_info) => {
                s_time_info._is_detached =  true;
                ()
            }
            _ => ()
        }
    }

    fn detach_session(&mut self, session_token : SessionToken) -> () {
        match self._session_timing.get_mut(&session_token) {
            Some(s_time_info) => {
                s_time_info._is_detached = false;
                if s_time_info._shared {
                    match serde_json::to_string(&s_time_info) {
                        Ok(value) => {
                            self._db.set_key_value(&session_token,value.as_str());    // await 
                            ()        
                        }
                        _ => ()
                    }
                }
            }
            _ => ()
        }
    }

    fn attach_session(&mut self, session_token : SessionToken) -> () {
        match self._session_timing.get_mut(&session_token) {
            Some(s_time_info) => {
                s_time_info._detachment_allowed = true;
                if s_time_info._shared {
                    match serde_json::to_string(&s_time_info) {
                        Ok(value) => {
                            self._db.set_key_value(&session_token,value.as_str());    // await 
                            ()        
                        }
                        _ => ()
                    }
                }
            }
            _ => ()
        }
    }


    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    fn create_token(&self, prefix : Option<String> ) -> Token {
        match prefix {
            Some(prfx) => {
                let spfx = prfx.as_str();
                (self._token_creator)(Some(spfx))
            }
            None => {
                (self._token_creator)(None)
            }
        }
    }

    fn add_token(&mut self, token : TransitionToken, value : StructOrString<Self::Jsonable> ) -> () {
        //
        let tval : String;
        match value {
            StructOrString::TypeA(sval) => {
                tval = sval;
            }
            StructOrString::TypeB(struct_val) => {
                let jval = struct_val.to_string();
                tval = jval;
            }
        }

        self._db.set_key_value(&token,tval.as_str());
        self._token_to_information.insert(token,tval);
    }


    fn transition_token_is_active(&mut self, token : TransitionToken) -> Option<String> {
        match self._token_to_information.get(&token) {
            Some(value) => {
                Some(value.to_string())
            }
            _ => {
                match self._db.get_key_value(&token) {
                    Some(db_val) => {
                        let sval : String = db_val.to_string();
                        self.add_token(token,StructOrString::TypeA(sval.clone()));
                        Some(sval)
                    }
                    _ => None
                }
            }
        }
    }


    fn destroy_token(&mut self, token : & TransitionToken) -> () {

        let t = token.clone();
        if let Some(session_token) = self._token_to_session.get(&t) {
            //
            if let Some(sess_token_set) = self._sessions_to_their_tokens.get_mut(session_token) {
                //
                sess_token_set.clear();
                let t = token.clone();
                self._db.del_key_value(&t);
                //
                let t = Token::TransitionToken(token.to_string());
                self._token_to_owner.remove(&t);    
            }
        }

        {
            self._token_to_session.remove(token);
        }

    }


    fn from_token(&self, token : TransitionToken) -> Ucwid {
        let t = Token::TransitionToken(token);
        match self._token_to_owner.get(&t) {
            Some(ucwid) => ucwid.to_owned(),
            _ => "".to_string()
        }
    }


    fn add_transferable_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid ) -> () {
        //
        match self._owner_to_session.get(ownership_key) {
            Some(session_token) => {
                let sst = session_token.to_string();
                match self._sessions_to_their_tokens.get_mut(&sst) {
                    Some(sess_token_set) => {
                        self._token_to_session.insert(t_token.to_string(), sst);
                        sess_token_set.session_carries.insert(t_token.to_string());
                        self.add_token(t_token.to_string(),value);
                    }
                    _ => ()
                }
            }
            _ => ()
        }
    }


    fn transfer_token(&mut self,  t_token : & TransitionToken, yielder_key : & Ucwid,  receiver_key : & Ucwid ) -> () {
        match self._owner_to_session.get(yielder_key) {
            Some(y_session_token) => {
                let ysst = y_session_token.to_string();
                match self._sessions_to_their_tokens.get(&ysst) {
                    Some(sess_token_set) => {
                        if sess_token_set.session_carries.contains(t_token) {
                            self.destroy_token(&t_token);
                            match self._owner_to_session.get(receiver_key) {
                                Some(r_session_token) => {
                                    let rsst = r_session_token.to_string();
                                    self._token_to_session.insert(t_token.to_string(),rsst.to_string());
                                    match self._sessions_to_their_tokens.get_mut(&rsst) {
                                        Some(r_sess_token_set) => {
                                            r_sess_token_set.session_carries.insert(t_token.to_string());
                                            let t = Token::TransitionToken(t_token.to_string());                            
                                            self._token_to_owner.insert(t,receiver_key.to_string());
                                        }
                                        _ => ()
                                    }                                              
                                }
                                _ => ()
                            }
                        }
                    }
                    _ => ()
                }
            }
            _ => ()
        }
        ()
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


}



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


fn main() {

    let st : Token = default_token_maker(Some("user+"));
    let tt : Token = default_token_maker(None);
    let prfx_tt : Token = default_token_maker(Some("media+"));

    print!("{:#?}\n",st);
    print!("{:#?}\n",tt);
    print!("{:#?}\n",prfx_tt);

    //

    let mut sts : SessionTokenSets = SessionTokenSets::new();

    match tt {
        Token::TransitionToken(trans) => {
            sts.session_carries.insert(trans);
        },
        Token::SessionToken(sess) => {
            print!("{:#?}\n",sess);
        }
    }

    match st {
        Token::TransitionToken(trans) => {
            sts.session_carries.insert(trans);
        },
        Token::SessionToken(sess) => {
            sts.session_bounded.insert(sess.clone());
            print!("{:#?}\n",sess);
        }
    }



    //
    println!("IDs Listed!");
}
