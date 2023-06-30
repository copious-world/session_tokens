// 
//
use std::str;
use fastuuid::Generator;
use std::collections::{HashSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{Result,to_string};


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

// ---- ----

#[allow(non_camel_case_types)]
type token_lambda = Box<fn (Option<&str>) -> Token>;

// ---- ----

const SESSION_PEFIX : &str = "user+";

// ---- ----

pub trait SessionTokenTraits {
    fn new() -> Self;
    fn clear(&mut self) -> ();
}


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
    fn create_token(&self, prefix : Option<String> ) -> Token;
    fn add_token(&mut self, token : TransitionToken, value : StructOrString<Self::Jsonable> ) -> ();
    fn transition_token_is_active(&mut self, token : TransitionToken) -> Option<String>;
    fn destroy_token(&mut self, token : & TransitionToken) -> ();
    fn from_token(&self, token : TransitionToken) -> Ucwid;

    fn add_session(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, o_t_token : Option<TransitionToken> ) -> ();
    fn active_session(&self, session_token : & SessionToken, ownership_key : & Ucwid) -> Option<bool>;
    fn destroy_session(&mut self, token : & TransitionToken) -> ();
    fn add_transferable_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid ) -> ();
    fn transfer_token(&mut self,  t_token : & TransitionToken, yielder_key : & Ucwid,  receiver_key : & Ucwid )  -> ();
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


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


struct LocalSessionTokens {
    //
    db : Box<dyn DB>,
    //
    session_to_owner : HashMap<SessionToken,Ucwid>,
    owner_to_session : HashMap<Ucwid,SessionToken>,  
    token_to_owner : HashMap<Token,Ucwid>,
    token_to_session : HashMap<TransitionToken,SessionToken>,
    session_checking_tokens : HashMap<SessionToken,String>,
    token_to_information : HashMap<TransitionToken,String>,
    sessions_to_their_tokens :  HashMap<SessionToken,SessionTokenSets>,
    //
    _token_creator : token_lambda
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
        let tl : token_lambda;
        match token_creator {
            Some(app_tl) => {
                tl = app_tl;
            },
            None => {
                tl = Box::new(default_token_maker);
            }
        }
        LocalSessionTokens {
            db : db,
            session_to_owner : s_to_o,
            owner_to_session : o_to_s,  
            token_to_owner : t_to_o,
            token_to_session : t_to_s,
            session_checking_tokens : s_c_t,
            token_to_information : t_to_i,
            sessions_to_their_tokens :  s_to_t,
            _token_creator : tl                
        }
    }

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

        self.db.set_key_value(&token,tval.as_str());
        self.token_to_information.insert(token,tval);
    }


    fn transition_token_is_active(&mut self, token : TransitionToken) -> Option<String> {
        //
        match self.token_to_information.get(&token) {
            Some(value) => {
                Some(value.to_string())
            }
            _ => {
                match self.db.get_key_value(&token) {
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

        {
            self.token_to_session.remove(token);
        }

        if let Some(session_token) = self.token_to_session.get(token) {
            //
            if let Some(sess_token_set) = self.sessions_to_their_tokens.get_mut(session_token) {
                //
                sess_token_set.clear();
                let t = token.clone();
                self.db.del_key_value(&t);
                //
                let t = Token::TransitionToken(token.to_string());
                self.token_to_owner.remove(&t);    
                //
                ()
            } else {
                ()
            };
        }
    }


    fn from_token(&self, token : TransitionToken) -> Ucwid {
        let t = Token::TransitionToken(token);
        match self.token_to_owner.get(&t) {
            Some(ucwid) => ucwid.to_owned(),
            _ => "".to_string()
        }
    }


    fn add_session(&mut self, session_token : & SessionToken, ownership_key : & Ucwid, o_t_token : Option<TransitionToken> ) -> () {
        let hash_of_p2 = self.db.set_session_key_value(&session_token,ownership_key.to_string());
        self.session_to_owner.insert(session_token.to_string(),ownership_key.to_string());
        self.session_checking_tokens.insert(session_token.to_string(),hash_of_p2.to_string());
        let st = Token::SessionToken(session_token.to_string());
        self.token_to_owner.insert(st,ownership_key.to_string());
        self.sessions_to_their_tokens.insert(session_token.to_string(),SessionTokenSets::new());
        match o_t_token {
            Some(t_token) => {
                self.token_to_session.insert(t_token.to_string(), session_token.to_string());
                let st = session_token.to_string();
                let sess_token_set = self.sessions_to_their_tokens.get_mut(&st).unwrap();
                sess_token_set.session_bounded.insert(t_token.to_string());
                //
                let tt = Token::TransitionToken(t_token.to_string());
                self.token_to_owner.insert(tt,ownership_key.to_string());
                let owk = StructOrString::TypeA(hash_of_p2.to_string());
                self.add_token(t_token, owk);
            }
            _ => ()
        }
    }



    fn active_session(&self, session_token : & SessionToken, ownership_key : & Ucwid) -> Option<bool> {
        //
        match self.session_checking_tokens.get(session_token) {
            Some(hh_unidentified) => {
                let hh_str : & str = hh_unidentified.as_str();
                let truth = self.db.check_hash(hh_str,ownership_key.to_string());
                Some(truth)
            }
            _ => Some(false)
        }
    }


    fn destroy_session(&mut self, token : & TransitionToken) -> () {
        //
        match self.token_to_session.get(token) {
            Some(session_token) => {
                self.session_to_owner.remove(session_token); // the session transition token 
                self.session_checking_tokens.remove(session_token);
                let t = Token::TransitionToken(token.to_string());
                self.token_to_owner.remove(&t);
                self.sessions_to_their_tokens.remove(session_token);
                self.db.del_session_key_value(session_token);
            }
            _ => ()
        }
        //
    }


    fn add_transferable_token(&mut self,  t_token : & TransitionToken, value : StructOrString<Self::Jsonable>, ownership_key : & Ucwid ) -> () {
        //
        match self.owner_to_session.get(ownership_key) {
            Some(session_token) => {
                let sst = session_token.to_string();
                match self.sessions_to_their_tokens.get_mut(&sst) {
                    Some(sess_token_set) => {
                        self.token_to_session.insert(t_token.to_string(), sst);
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
        //
        match self.owner_to_session.get(yielder_key) {
            Some(y_session_token) => {
                let ysst = y_session_token.to_string();
                match self.sessions_to_their_tokens.get(&ysst) {
                    Some(sess_token_set) => {
                        if sess_token_set.session_carries.contains(t_token) {
                            self.destroy_token(&t_token);
                            match self.owner_to_session.get(receiver_key) {
                                Some(r_session_token) => {
                                    let rsst = r_session_token.to_string();
                                    self.token_to_session.insert(t_token.to_string(),rsst.to_string());
                                    match self.sessions_to_their_tokens.get_mut(&rsst) {
                                        Some(r_sess_token_set) => {
                                            r_sess_token_set.session_carries.insert(t_token.to_string());
                                            let t = Token::TransitionToken(t_token.to_string());                            
                                            self.token_to_owner.insert(t,receiver_key.to_string());
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
