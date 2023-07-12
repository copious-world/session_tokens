// 
//
use std::str;
use fastuuid::Generator;
use std::collections::{HashSet, HashMap};
//
//use std::future;
use async_trait::async_trait;
use async_std::prelude::*;

use futures::future;


use serde::{Deserialize, Serialize};
use serde_json::{Value};

use derive_builder::Builder;
use std::pin::Pin;
use std::marker::PhantomData;


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
    TypeStr(String),
    TypeGen(T),
}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

#[allow(non_camel_case_types)]
type token_lambda = Box<fn (Option<&str>) -> Token>;

// ---- ----

const SESSION_PEFIX : &str = "user+";

const MINUTES : i32 = 1000*60;
const GENERAL_DEFAULT_SESSION_TIMEOUT : i32 = 60*MINUTES;
const SESSION_CHOP_INTERVAL : i32 = 500;


// ---- ----

pub trait SessionTokenTraits {
    fn new() -> Self;
    fn clear(&mut self) -> ();
}


#[async_trait]
pub trait DB<'a>: Sync + Send {
    async fn set_session_key_value(&self, session_token : & SessionToken, ownership_key : Ucwid ) -> Hash;
    fn del_session_key_value(&self, session_token : & SessionToken ) -> bool;
    fn set_key_value(&self, token : & TransitionToken, value : &str )  -> ();
    async fn get_key_value(&self, token : & TransitionToken )  -> Option<&str>;
    fn del_key_value(&self, token : & TransitionToken )  -> ();
    async fn check_hash(&self, hh_unidentified : &str, ownership_key : Ucwid )  -> bool;
}

#[async_trait]
pub trait TokenTables<'a, D: DB<'a>> {
    type Jsonable;
    //
    fn new(db : D, token_creator : Option<token_lambda>) -> Self;
    //
    fn decrement_timers(&mut self) -> ();
    fn set_token_creator(&mut self, token_creator : Option<token_lambda>) -> ();
    //
    async fn add_session(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, o_t_token : Option<TransitionToken>, shared : Option<bool> ) -> Option<Hash>;
    async fn active_session(&self, session_token : & SessionToken, ownership_key : & Ucwid) -> Option<bool>;
    fn destroy_session(&mut self, token : & TransitionToken) -> ();
    fn allow_session_detach(&mut self, session_token : SessionToken) -> ();
    fn detach_session(&mut self, session_token : SessionToken) -> ();
    fn attach_session(&mut self, session_token : SessionToken) -> ();
    //
    fn create_token(&self, prefix : Option<String> ) -> Token;          // await
    fn add_token(&mut self, token : &TransitionToken, value : StructOrString<Self::Jsonable> ) -> ();
    async fn transition_token_is_active(&mut self, token : & TransitionToken) -> Option<String>;        // await
    fn from_token(&self, token : TransitionToken) -> Ucwid;
    fn add_transferable_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid ) -> ();
    fn add_session_bounded_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid )  -> ();  // => Promise<void>
    async fn acquire_token(&mut self, t_token : & TransitionToken, session_token : & SessionToken, owner : & Ucwid) -> bool;    // => Promise<boolean>
    fn token_is_transferable(&self,  t_token : &TransitionToken) -> bool;
    //
    async fn transfer_token(&mut self,  t_token : & TransitionToken, yielder_key : & Ucwid,  receiver_key : & Ucwid )  -> ();
    fn destroy_token(&mut self, token : & TransitionToken) -> ();

    //
    fn set_general_session_timeout(&mut self, timeout : i32) -> ();
    fn set_session_timeout(&mut self, session_token : & SessionToken, timeout : i32) -> ();
    fn get_session_timeout(&mut self, session_token : & SessionToken) -> Option<i32>;
    fn get_session_time_left(&mut self, session_token : & SessionToken) -> Option<i32>;
    //
    fn set_general_token_timeout(&mut self, timeout : i32) -> ();
    fn set_disownment_token_timeout(&mut self, t_token : & TransitionToken, timeout : i32) -> ();
    fn set_token_timeout(&mut self, t_token : & TransitionToken,timeout : i32) -> ();
    fn get_token_timeout(&mut self, t_token : & TransitionToken) -> Option<i32>;
    fn get_token_time_left(&mut self, t_token : & TransitionToken)  ->  Option<i32>;
    fn set_token_sellable(&mut self, t_token : & TransitionToken, amount : Option<f32>) -> ();
    fn unset_token_sellable(&mut self, t_token : & TransitionToken) -> ();
    //
    async fn reload_session_info(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, hash_of_p2 : Hash) -> bool; // Promise<boolean> 
    async fn reload_token_info(&mut self, t_token : & TransitionToken) -> ();    // : Promise<void>
    //
    fn list_tranferable_tokens(&mut self, session_token : & SessionToken) -> Vec<TransitionToken>;
    fn list_sellable_tokens(&mut self) -> Vec<TransitionToken>;
    fn list_unassigned_tokens(&mut self) -> Vec<TransitionToken>;
    fn list_detached_sessions(&mut self) -> Vec<SessionToken>;

}



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
    _time_left : i32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_left_after_detachment : i32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_allotted : i32,
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
    _time_left : i32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_left_after_detachment : i32,
    #[builder(default = "GENERAL_DEFAULT_SESSION_TIMEOUT")]
    _time_allotted : i32,
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


struct LocalSessionTokens< D: for<'a> DB<'a> + std::marker::Unpin > {
    //
    _db : D,
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
    _general_session_timeout : i32,
    _session_time_chopper : i32,
    _general_token_timeout : i32,
}



fn return_<S,T> (_t_to_thing : & HashMap::<S,T>,  tok : &S) -> Option<T> where S: Eq, S: std::hash::Hash, T: Clone {
    match _t_to_thing.get(tok) {
        Some(sts) => {
            Some(sts.clone())
        }
        _ => None
    }
}




#[async_trait]
impl<D: for<'a> DB<'a> + std::marker::Unpin> TokenTables<'_, D> for LocalSessionTokens<D> {
    type Jsonable = serde_json::Value;
    //
    fn new(db : D, token_creator : Option<token_lambda>) -> LocalSessionTokens<D> {
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
            _general_token_timeout : i32::MAX,
        }
    }



    fn decrement_timers(&mut self) -> () {
        //
        {
            let mut to_destory = Vec::<SessionToken>::new();
            let its = self._session_timing.iter_mut();
            //
            for (sess_tok, time_info) in its {
                if time_info._is_detached {
                    let mut time_left = time_info._time_left_after_detachment;
                    time_left -= SESSION_CHOP_INTERVAL;
                    if time_left <= 0 {
                        to_destory.push(sess_tok.to_string());
                    } else {
                        (*time_info)._time_left_after_detachment = time_left;
                    }
                } else {
                    let mut time_left = time_info._time_left;
                    time_left -= SESSION_CHOP_INTERVAL;
                    if time_left <= 0 {
                        to_destory.push(sess_tok.to_string());
                    }  else {
                        (*time_info)._time_left = time_left;
                    }
                }
            }
            if to_destory.len() > 0 {
                for sess_tok in to_destory {
                    self._session_timing.remove(&sess_tok);
                    self.destroy_token(&sess_tok);
                }
            }
        }
        {
            let mut to_destory = Vec::<TransitionToken>::new();
            let its = self._token_timing.iter_mut();
            //
            for (sess_tok, time_info) in its {
                if time_info._is_detached {
                    let mut time_left = time_info._time_left_after_detachment;
                    time_left -= SESSION_CHOP_INTERVAL;
                    if time_left <= 0 {
                        to_destory.push(sess_tok.to_string());
                    } else {
                        (*time_info)._time_left_after_detachment = time_left;
                    }
                } else {
                    let mut time_left = time_info._time_left;
                    time_left -= SESSION_CHOP_INTERVAL;
                    if time_left <= 0 {
                        to_destory.push(sess_tok.to_string());
                    }  else {
                        (*time_info)._time_left = time_left;
                    }
                }
            }
            if to_destory.len() > 0 {
                for sess_tok in to_destory {
                    self._token_timing.remove(&sess_tok);
                    self.destroy_token(&sess_tok);
                }
            }
        }
    }

    fn set_token_creator(&mut self, token_creator : Option<token_lambda>) -> () {
        self._token_creator = token_creator.unwrap();
    }

    async fn add_session(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, o_t_token : Option<TransitionToken>, shared :  Option<bool>) -> Option<Hash> {
        let hash_of_p2 = self._db.set_session_key_value(&session_token,ownership_key.to_string()).await;  // await
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
                let owk = StructOrString::TypeStr(hash_of_p2.to_string());
                self.add_token(&t_token, owk);
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

    async fn active_session(&self, session_token : & SessionToken, ownership_key : & Ucwid) -> Option<bool> {
        //
        match self._session_checking_tokens.get(session_token) {
            Some(hh_unidentified) => {
                let hh_str : & str = hh_unidentified.as_str();
                let truth = self._db.check_hash(hh_str,ownership_key.to_string()).await; // await
                Some(truth)
            }
            _ => Some(false)
        }
    }


    fn destroy_session(&mut self, t_token : & TransitionToken) -> () {
        //
        let session_token = match return_::<TransitionToken,SessionToken>(& self._token_to_session,t_token) {
            Some(st) => st,
            _ => "".to_string()
        };
        //
        if session_token.len() > 0 {
            self._detached_sessions.remove(&session_token);
            self._session_to_owner.remove(&session_token); // the session transition token 
            self._session_checking_tokens.remove(&session_token);
            if let Some(time_info) = self._session_timing.get_mut(&session_token) {
                if time_info._shared {
                    self._db.del_key_value(&session_token.to_string());   // await
                }
            }
            //
            self._session_timing.remove(&session_token);
            let st = Token::SessionToken(session_token.to_string());
            self._token_to_owner.remove(&st);
            //

            match return_::<SessionToken,SessionTokenSets>(& self._sessions_to_their_tokens,&session_token) {
                Some(token_sets) => {
                    for token in &token_sets.session_carries {
                        self._orphaned_tokens.insert(token.to_string());            // orphaned
                    }
                    for token in &token_sets.session_bounded {
                        self.destroy_token(&token);
                    }
                }
                _ => ()
            };
    
            self._sessions_to_their_tokens.remove(&session_token);
            self._db.del_session_key_value(&session_token.to_string());
        }
    }


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
                self._detached_sessions.insert(session_token.to_string());
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
                self._detached_sessions.remove(&session_token);
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

    fn add_token(&mut self, t_token : & TransitionToken, value : StructOrString<Self::Jsonable> ) -> () {
        //
        let tval : String;
        match value {
            StructOrString::TypeStr(sval) => {
                tval = sval;
            }
            StructOrString::TypeGen(struct_val) => {
                let jval = struct_val.to_string();
                tval = jval;
            }
        }

        self._db.set_key_value(&t_token,tval.as_str());       // await
        self._token_to_information.insert(t_token.to_string(),tval);

        let tti = TokenTimingInfoBuilder::default().build().ok();
        if let Some(tt_info) = tti {
            self._token_timing.insert(t_token.to_string(),tt_info);
        }
    }



    async fn transition_token_is_active(&mut self, token : & TransitionToken) -> Option<String> {
        match self._token_to_information.get(token) {
            Some(value) => {
                Some(value.to_string())
            }
            _ => {
                match self._db.get_key_value(token).await {
                    Some(db_val) => {
                        let sval : String = db_val.to_string();
                        self.add_token(token,StructOrString::TypeStr(sval.clone()));
                        Some(sval)
                    }
                    _ => None
                }
            }
        }
    }


    fn destroy_token(&mut self, t_token : & TransitionToken) -> () {
        //
        let t = t_token.clone();
        if let Some(session_token) = self._token_to_session.get(&t) {
            if let Some(sess_token_set) = self._sessions_to_their_tokens.get_mut(session_token) {
                //
                sess_token_set.session_bounded.remove(t_token);
                sess_token_set.session_carries.remove(t_token);
                //
            }
        }
        //
        {
            self._token_to_information.remove(t_token);
            let t : Token = Token::TransitionToken(t_token.to_string());
            self._token_to_owner.remove(&t);        // This map use the more generic Token enumerated type
            self._orphaned_tokens.remove(t_token);
            self._token_timing.remove(t_token);
            self._all_tranferable_tokens.remove(t_token);
            self._token_to_session.remove(t_token);
            //
            let t = t_token.clone();
            self._db.del_key_value(&t);
        }
        //
    }


    fn from_token(&self, token : TransitionToken) -> Ucwid {
        let t = Token::TransitionToken(token);
        match self._token_to_owner.get(&t) {
            Some(ucwid) => ucwid.to_owned(),
            _ => "".to_string()
        }
    }


    fn add_session_bounded_token(&mut self, t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid )  -> () {
        if let Some(session_token)  = self._owner_to_session.get(ownership_key) {
            let sst = session_token.to_string();
            match self._sessions_to_their_tokens.get_mut(&sst) {
                Some(sess_token_set) => {
                    sess_token_set.session_bounded.insert(t_token.to_string());
                    //
                    self._token_to_session.insert(t_token.to_string(), session_token.to_string());
                    let tti = TransferableTokenInfoBuilder::default().build().ok();
                    if let Some(mut tt_info) = tti {
                        tt_info._owner = ownership_key.to_string();
                        self._all_tranferable_tokens.insert(t_token.to_string(),tt_info);
                        self.add_token(&t_token,value);
                    }
                }
                _ => ()
            }
        }
    }


    fn add_transferable_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid ) -> () {
        match self._owner_to_session.get(ownership_key) {
            Some(session_token) => {
                let sst = session_token.to_string();
                match self._sessions_to_their_tokens.get_mut(&sst) {
                    Some(sess_token_set) => {
                        let tt = Token::TransitionToken(t_token.to_string());
                        self._token_to_owner.insert(tt,ownership_key.to_string());
                        self._token_to_session.insert(t_token.to_string(), sst);
                        sess_token_set.session_carries.insert(t_token.to_string());
                        //
                        let tti = TransferableTokenInfoBuilder::default().build().ok();
                        if let Some(mut tt_info) = tti {
                            tt_info._owner = ownership_key.clone();
                            let store_value : String;
                            let deser_val : Value;
                            match value {
                                StructOrString::TypeStr(sval) => {
                                    store_value = sval.clone();
                                    if let Ok(Some(ssval)) = serde_json::from_str(&sval.as_str()) {
                                        deser_val = ssval;
                                    } else {
                                        return ()
                                    }
                                }
                                StructOrString::TypeGen(struct_val) => {
                                    deser_val = struct_val.clone();
                                    let jval = struct_val.to_string();
                                    store_value = jval;
                                }
                            };
                            tt_info.set_all(deser_val);
                            self._all_tranferable_tokens.insert(t_token.to_string(),tt_info);
                            self.add_token(&t_token,StructOrString::TypeStr(store_value));
                        }
                        ()
                    }
                    _ => ()
                }
            }
            _ => ()
        }
        ()
    }

    //      token_is_transferable
    //
    fn token_is_transferable(&self, t_token : &TransitionToken) -> bool {
        if let Some(_ttok) = self._all_tranferable_tokens.get(t_token) {
            return true
        }
        return false
    }


    //      acquire_token
    //
    async fn acquire_token(&mut self, t_token : & TransitionToken, session_token : & SessionToken, owner : & Ucwid) -> bool {
        if let Some(value) = self.transition_token_is_active(t_token).await {
            self._token_to_session.insert(t_token.to_string(),session_token.to_string());
            match serde_json::to_string(&value) {
                Ok(obj) => {
                    self.add_transferable_token(t_token,StructOrString::TypeStr(obj),owner);
                    () 
                }
                _ => ()
            };
            return true;
        }
        return false;
    }


    //      transfer_token
    //
    async fn transfer_token(&mut self,  t_token : & TransitionToken, yielder_key : & Ucwid,  receiver_key : & Ucwid ) -> () {
        //
        if self.token_is_transferable(t_token) {
            let mut t_info_str : String = "".to_string();
            if let Some(tis) =  self._token_to_information.get(t_token) {  // get this before it is possibly removed
                t_info_str = tis.to_string();
            } 
            match self._owner_to_session.get(yielder_key) {
                Some(y_session_token) => {
                    let ysst = y_session_token.to_string();
                    if !self._orphaned_tokens.contains(t_token) {
                        match self._sessions_to_their_tokens.get(&ysst) {
                            Some(sess_token_set) => {
                                if sess_token_set.session_carries.contains(t_token) {
                                    self.destroy_token(&t_token);
                                }
                            }
                            _ => ()
                        }
                    }
    
                    match self._owner_to_session.get(receiver_key) {
                        Some(r_session_token) => {
                            let rsst = r_session_token.to_string();
                            self._token_to_information.insert(t_token.to_string(),t_info_str.to_string());
                            if let Some(value) = self.transition_token_is_active(t_token).await { //  await 
                                self.add_transferable_token(t_token, StructOrString::TypeStr(value), receiver_key);
                            }
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
                _ => ()
            }
        }
        ()
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----



    fn set_general_session_timeout(&mut self, timeout : i32) -> () {
        self._general_token_timeout = timeout
    }

    fn set_session_timeout(&mut self, session_token : & SessionToken, timeout : i32) -> () {
        if let Some(s_time_info) = self._session_timing.get_mut(session_token) {
            s_time_info._time_allotted = timeout;
            s_time_info._time_left = timeout;
            if s_time_info._shared {
                if let Ok(value) = serde_json::to_string(s_time_info) {
                    self._db.set_key_value(session_token,value.as_str()); // await
                }
            }
        }
    }


    fn get_session_timeout(&mut self, session_token : & SessionToken) -> Option<i32> {
        if let Some(s_time_info) = self._session_timing.get(session_token) {
            return Some(s_time_info._time_allotted)
        }
        None
    }

    fn get_session_time_left(&mut self, session_token : & SessionToken) -> Option<i32> {
        if let Some(s_time_info) = self._session_timing.get(session_token) {
            return Some(s_time_info._time_left)
        }
        None
    }

    //
    fn set_general_token_timeout(&mut self, timeout : i32) -> () {
        self._general_token_timeout = timeout;
    }

    fn set_disownment_token_timeout(&mut self, t_token : & TransitionToken, timeout : i32) -> () {
        if let Some(time_info) = self._token_timing.get_mut(t_token) {
            time_info._time_left_after_detachment = timeout;
        }
    }

    fn set_token_timeout(&mut self, t_token : & TransitionToken,timeout : i32) -> () {
        if let Some(time_info) = self._token_timing.get_mut(t_token) {
            time_info._time_allotted = timeout;
            time_info._time_left = timeout;
        }
    }

    fn get_token_timeout(&mut self, t_token : & TransitionToken)  ->  Option<i32> {
        if let Some(time_info) = self._token_timing.get_mut(t_token) {
            return Some(time_info._time_allotted)
        }
        None
    }

    fn get_token_time_left(&mut self, t_token : & TransitionToken)  ->  Option<i32> {
        if let Some(time_info) = self._token_timing.get_mut(t_token) {
            return Some(time_info._time_allotted)
        }
        None
    }


    fn set_token_sellable(&mut self, t_token : & TransitionToken, amount : Option<f32>) -> () {
        if let Some(tinf) = self._all_tranferable_tokens.get_mut(t_token) {
            if let Some(amt) = amount {
                tinf._price = amt;
            }
            tinf._sellable = true;
        }
    }


    fn unset_token_sellable(&mut self, t_token : & TransitionToken) -> () {
        if let Some(tinf) = self._all_tranferable_tokens.get_mut(t_token) {
            tinf._sellable = true;
        }
    }


    //
    async fn reload_session_info(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, hash_of_p2 : Hash) -> bool {
        if let Some(data) = self._db.get_key_value(session_token).await {   // await
            if let Some(truth) = self.active_session(session_token, ownership_key).await { // await
                if truth {
                    if let Ok(Some(stored_info)) = serde_json::from_str(&data) {
                        let s_info_q = SessionTimingInfoBuilder::default().build().ok();
                        if let Some(mut s_info) = s_info_q {
                            s_info.set_all(stored_info);
                            self._session_timing.insert(session_token.to_string(),s_info);
                        }
                        self._session_checking_tokens.insert(session_token.to_string(),hash_of_p2);
                        return true
                    }    
                }
            }
        }
        return false
    }


    async fn reload_token_info(&mut self, t_token : & TransitionToken) -> () {    // promise
        if let Some(data) = self._db.get_key_value(t_token).await {   // await
            if let Ok(Some(stored_info)) = serde_json::from_str(&data) {
                let t_info_q = TokenTimingInfoBuilder::default().build().ok();
                if let Some(mut t_info) = t_info_q {
                    t_info.set_all(stored_info);
                    self._token_timing.insert(t_token.to_string(),t_info);
                }
            }    
        }

        future::ready(()).await;
    }


    //
    fn list_tranferable_tokens(&mut self, session_token : & SessionToken) -> Vec<TransitionToken> {
        let mut v = Vec::<TransitionToken>::new();
        match self._session_timing.get(session_token) {
            Some(s_time_info) => {
                if s_time_info._detachment_allowed {
                    match return_::<SessionToken,SessionTokenSets>(& self._sessions_to_their_tokens,&session_token) {
                        Some(token_sets) => {
                            for token in &token_sets.session_carries {
                                v.push(token.to_string());
                            }
                        }
                        _ => ()
                    };
                }
                ()
            }
            _ => ()
        };
        //
        v
    }


    //
    //
    fn list_sellable_tokens(&mut self) -> Vec<TransitionToken> {
        let mut v = Vec::<TransitionToken>::new();
        let its = self._all_tranferable_tokens.iter().collect::<Vec<_>>();
        for (token, t_info) in &its {
            if t_info._sellable {
                v.push(token.to_string());
            }
        }
        v
    }

    //
    fn list_unassigned_tokens(&mut self) -> Vec<TransitionToken> {  // _orphaned_tokens
        let mut v = Vec::<TransitionToken>::new();
        let its = self._orphaned_tokens.iter().collect::<Vec<_>>();
        for token in &its {
            v.push(token.to_string());
        }
        v
    }

    //
    //
    fn list_detached_sessions(&mut self) -> Vec<SessionToken> {  // _detached_sessions
        let mut v = Vec::<SessionToken>::new();
        let its = self._detached_sessions.iter().collect::<Vec<_>>();
        for token in &its {
            v.push(token.to_string());
        }
        v
    }


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


