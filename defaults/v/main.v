import json
import rand
import math


pub type Hash = string
pub type SessionToken = string
pub type TransitionToken = string
pub type Ucwid = string
pub type Token = TransitionToken | SessionToken

pub type Optional[T] = T | none
pub type Varied = string | bool | int
pub type MapOrString =  string | map[string]Varied



const MINUTES = 1000*60
const GENERAL_DEFAULT_SESSION_TIMEOUT 60*MINUTES
const SESSION_CHOP_INTERVAL 500


// SET MODULE
struct Set[T] {
mut:
    store               map[T]bool{}
}


// MyStruct implements the interface Foo, but *not* interface Bar
fn (s Set[T]) insert(a T) string {
   s.store[a] = true
}

// MyStruct implements the interface Foo, but *not* interface Bar
fn (s Set[T]) delete(a T) {
   s.store.delete(a)
}

fn (s Set[T]) contains(a T) bool {
    return s.store[a]
}

fn (s Set[T]) size() int {
    return s.store.keys.len
}

fn (s Set[T]) clear() {
    s.store.clear()
}

/**
 * @callback token_lambda -- a method that generates a token from a random number generator... does not make a hash 
 * @param {string} [prefix] -- optionally prefix the token whith an application specfic string
 * @returns {Token} -- a unique identifier relative to the running application scope (defind by the application)
 */
type Token_lambda = fn (prefix Optional[string]) Token


const session_prefix = "user+"

// 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'

fn uuid() string {
    mut rbytes := rand.hex(8)
    rbytes += '-'
    rbytes += rand.hex(4)
    rbytes += '-4'
    rbytes += rand.hex(3)
    mut y := rand.i16()
    y = (y & 0x3 | 0x8)
    rbytes += y.str()
    rbytes += rand.hex(3)
    rbytes += '-'
    rbytes += rand.hex(12)
    return rbytes
}


/**
 * A default token producer is available for implementations that omit 
 * an application defined token producer
 */
fn default_token_maker(prefix Optional[string]) Token {
    suuid := uuid()
    mut token := ''
    if prefix is string {
        token = prefix + suuid
        if session_prefix == prefix {
            stoken := SessionToken(token)
            return Token(stoken)
        } else {
            ttoken := TransitionToken(token)
            return Token(ttoken)
        }
    } else {
        token = suuid
        ttoken := TransitionToken(token)
        return Token(ttoken)
    }
}



/**
 * DB interfaces are supplied in order to ensure that a session can last outside the 
 * lifetime of an executable, given that the excecutable may fail or that a session may be put on pause.
 * The DB interfaces also provides a formalism for sharing information between microservices.
 * 
 * The DB interface specifies methods that handle different kinds of database relationships.
 * It is expected that the session keys will be in kind, while general tokens will be in 
 * another kind, a key value database for instance. Optionally, it can be a different kind of implementation,
 * for a key value stored, but if the same as for sessions, it is expected to be another instance.
 * 
 * Different applications may have different key value databases. For instance, 
 * some may be global persistence databases, while some may be shared memory caches, like those
 * provided by global_session. But, even if they are the same, the session data base will store a hash of data
 * identifying the session, while the token database will store actual values; where, the values stored in the database
 * may be keys or serializations of share token data.
 */

pub interface DB {
mut:
    set_session_key_value(session_token SessionToken, ownership_key Ucwid) Hash     // async 
    set_key_value(t_token TransitionToken, value string)
    del_session_key_value (session_token SessionToken) !bool
    get_key_value(t_token &TransitionToken) ?string                     // async
    del_key_value(t_token &TransitionToken)
    check_hash(hh_unidentified &string, ownership_key &Ucwid) bool
}



/**
 * Management of session and their tokens.
 */

pub interface TokenTables{
    type Jsonable = string
    //
mut:
    new[D](db D, token_creator ?token_lambda) TokenTables
    //
    decrement_timers()
    set_token_creator( token_creator Optional[token_lambda])
    //
    add_session( session_token & SessionToken, ownership_key & Ucwid, o_t_token Optional[TransitionToken], shared Optional[bool] ) ?Hash // async 
    active_session(session_token & SessionToken, ownership_key & Ucwid) ?bool // async 
    destroy_session( token & TransitionToken)
    allow_session_detach( session_token SessionToken)
    detach_session( session_token SessionToken)
    attach_session( session_token SessionToken)
    //
    create_token(&self, prefix Optional[string] ) Token          // await
    add_token( token &TransitionToken, value MapOrString[Jsonable] )
    transition_token_is_active( token & TransitionToken) ?string     // async   await
    from_token(token &TransitionToken) Ucwid
    add_transferable_token(  t_token & TransitionToken, value MapOrString[Jsonable], ownership_key & Ucwid )
    add_session_bounded_token(  t_token & TransitionToken, value MapOrString[Jsonable], ownership_key & Ucwid )   // => Promise<void>
    acquire_token( t_token & TransitionToken, session_token & SessionToken, owner & Ucwid) bool   // => Promise<boolean>  async 
    token_is_transferable(t_token &TransitionToken) bool
    //
    transfer_token(  t_token & TransitionToken, yielder_key & Ucwid,  receiver_key & Ucwid ) // async 
    destroy_token( token & TransitionToken)

    //
    set_general_session_timeout( timeout i32)
    set_session_timeout( session_token & SessionToken, timeout i32)
    get_session_timeout( session_token & SessionToken) ?i32
    get_session_time_left( session_token & SessionToken) ?i32
    //
    set_general_token_timeout( timeout i32)
    set_disownment_token_timeout( t_token & TransitionToken, timeout i32)
    set_token_timeout( t_token & TransitionToken,timeout i32)
    get_token_timeout( t_token & TransitionToken) ?i32
    get_token_time_left( t_token & TransitionToken)   ?i32
    set_token_sellable( t_token & TransitionToken, amount Optional[f32])
    unset_token_sellable( t_token & TransitionToken)
    //
    reload_session_info( session_token & SessionToken, ownership_key & Ucwid, hash_of_p2 Hash) bool // Promise<boolean>   async 
    reload_token_info( t_token & TransitionToken)    // Promise<void>  async 
    //
    list_tranferable_tokens( session_token & SessionToken) []TransitionToken
    list_sellable_tokens() []TransitionToken
    list_unassigned_tokens() []TransitionToken
    list_detached_sessions() []]SessionToken
}

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


/**
 * 
 */
struct SessionTokenSets {
    session_bounded             Set[TransitionToken]
    session_carries             Set[TransitionToken]
}


fn (st SessionTokenSets) clear() {
    st.session_bounded.clear()
    st.session_carries.clear()
}


struct TokenTablesStruct {
mut:
     _db                                    &DB
    _token_lambda                           Token_lambda
    _session_to_owner                       map[SessionToken]Ucwid{}
    _owner_to_session                       map[Ucwid]SessionToken{}
    _token_to_owner                         map[Token]Ucwid{}
    _token_to_session                       map[TransitionToken]SessionToken{}
    _session_checking_tokens                map[SessionToken]string{}
    _token_to_information                   map[TransitionToken]string{}
    _sessions_to_their_tokens               map[SessionToken]SessionTokenSets{}
    //
    _detached_sessions :                    Set[SessionToken]
    _orphaned_tokens :                      Set[TransitionToken]
    //
    _session_timing :                       map[SessionToken]SessionTimingInfo{}
    _all_tranferable_tokens :               map[TransitionToken]TransferableTokenInfo{}
    _token_timing :                         map[SessionToken]TokenTimingInfo{}
    //
    _token_creator :            token_lambda
    //
    _general_session_timeout :  i32 = GENERAL_DEFAULT_SESSION_TIMEOUT
    _session_time_chopper :     i32 = GENERAL_DEFAULT_SESSION_TIMEOUT
    _general_token_timeout :    i32 = math.max_i32
}


// MyStruct implements the interface Foo, but *not* interface Bar
//
fn (tts TokenTablesStruct) new[D](mut db &D, tlambda Optional[Token_lambda]) TokenTables {
    //
    mut tl := Token_lambda{}
    if tlambda is Token_lambda {
        tl = tlambda
    } else {
        tl = default_token_maker
    }
    //
    //
    LocalSessionTokens {
        _db : db,
        _token_creator : tl
    }
}



//
fn (tts TokenTablesStruct) decrement_timers() {
}

//
fn (tts TokenTablesStruct) set_token_creator(token_creator Optional[token_lambda]) {
    tts._token_creator = token_creator
}

//
fn (tts TokenTablesStruct) add_session( session_token & SessionToken, ownership_key & Ucwid, o_t_token Optional[TransitionToken], shared Optional[bool] ) ?Hash  { // async 
    hash_of_p2 := tts._db.set_session_key_value(session_token,ownership_key)  // return hh unidentified == xxhash of value (value == ownership key)
    // later the session_token will be passed into get_session_key_value where it will be hashed into an augmented has token
    // for fetching hash_of_p2
    tts._session_to_owner[session_token] = ownership_key // the session transition token 
    tts._session_checking_tokens[session_token] = hash_of_p2
    tts._token_to_owner[session_token] = ownership_key

    sess_token_set := SessionTokenSets()
    //
    sess_token_set.session_bounded.insert(t_token.to_string());
    if ( o_t_token is TransitionToken ) {
        t_token := o_t_token
        tts._token_to_owner[t_token] = ownership_key
        tts.add_token(&t_token, hash_of_p2)
    }
    tts._sessions_to_their_tokens[session_token] = sess_token_set

    mut sti := SessionTimingInfoBuilder{}
    if ( shared ) {
        sti._shared = true;
        value := JSON.stringify(sti)
        tts._db.set_key_value(session_token,value)
    }
    tts._session_timing[session_token] == sti
}


// CHANGED
fn (tts TokenTablesStruct) active_session(session_token & SessionToken, ownership_key & Ucwid) ?bool { // async 
}
fn (tts TokenTablesStruct) active_session(session_token SessionToken, ownership_key Ucwid) ?bool {
    if ( hh_unidentified := tts._session_checking_tokens[session_token] ) {
        let truth = tts._db.check_hash(hh_unidentified,ownership_key)
        return truth
    }
    return false
}


// CHANGED
fn (tts TokenTablesStruct) destroy_session(token & TransitionToken) {

}
fn (tts TokenTablesStruct) destroy_session(t_token TransitionToken) {
    if ( session_token := tts._token_to_session[t_token] ) {
        tts._session_to_owner.delete(session_token) // the session transition token 
        tts._session_checking_tokens.delete(session_token)
        tts._token_to_owner.delete(token)
        tts._sessions_to_their_tokens.delete(session_token)
        tts._db.del_session_key_value(session_token)
    }
}




fn (tts TokenTablesStruct) allow_session_detachsession_token SessionToken) {

}

fn (tts TokenTablesStruct) detach_session(session_token SessionToken) {

}

fn (tts TokenTablesStruct) attach_session(session_token SessionToken) {
}
//



// Tokens -- 

fn (tts TokenTablesStruct) create_token(prefix Optional[string]) Token {
    return tts._token_creator(prefix)
}

fn (tts TokenTablesStruct) add_token(t_token &TransitionToken, value MapOrString[Jsonable] ) {
    if (  value !is 'string' ) {
        value = JSON.stringify(value)
    }
    tts._db.set_key_value(t_token,value)
    tts._token_to_information[t_token] = value
    //
    tti := TokenTimingInfoBuilder{}
    tts._token_timing.insert[t_token] = tt_info
}


// CHANGED
fn (tts TokenTablesStruct) transition_token_is_active( token & TransitionToken) ?string
{
}     // async   await
fn (tts TokenTablesStruct) transition_token_is_active(t_token TransitionToken) ?string {
    if ( token.len > 0 ) {
        value := tts._token_to_information[token]
        if ( value.len > 0 ) {
            return value
        } else {
            key := await tts._db.get_key_value(token)
            if ( key !is 'string' ) {
                return (false)
            } else {
                tts.add_token(token,key)
                return (key)
            }
        }
    }
    return none
}


fn (tts TokenTablesStruct)from_token(token &TransitionToken) Ucwid {
    return tts._token_to_owner[t_token]
}



// CHANGED
fn (tts TokenTablesStruct)add_transferable_token(  t_token & TransitionToken, value MapOrString[Jsonable], ownership_key & Ucwid ) {
}
fn (tts TokenTablesStruct) add_transferable_token(t_token TransitionToken, value MapOrString, ownership_key Ucwid ) {
    if ( session_token := tts._owner_to_session[ownership_key] ) {
        if ( sess_token_set := tts._sessions_to_their_tokens[session_token] ) {
            tts._token_to_session.[t_token] = session_token
            sess_token_set.session_carries.insert(t_token)
            await tts.add_token(t_token,value)
        }
    }
}






fn (tts TokenTablesStruct)add_session_bounded_token(  t_token & TransitionToken, value MapOrString[Jsonable], ownership_key & Ucwid ) {
}
// => Promise<void>


fn (tts TokenTablesStruct)acquire_token( t_token & TransitionToken, session_token & SessionToken, owner & Ucwid) bool {
}
// => Promise<boolean>  async 


fn (tts TokenTablesStruct)token_is_transferable(t_token &TransitionToken) bool {
}


//  CHANGED
fn (tts TokenTablesStruct)transfer_token(  t_token & TransitionToken, yielder_key & Ucwid,  receiver_key & Ucwid ) {
}
// async
fn (tts TokenTablesStruct) transfer_token(t_token TransitionToken, yielder_key Ucwid, receiver_key Ucwid ) {
    if ( y_session_token := tts._owner_to_session[yielder_key] ) {
        if ( sess_token_set := tts._sessions_to_their_tokens[y_session_token] ) {
            if ( sess_token_set.session_carries.contains(t_token) ) {
                tts.destroy_token(t_token)
                //  the receiver has to have an active session seen from this runtime
                if ( r_session_token := tts._owner_to_session[receiver_key] ) {
                    tts._token_to_session[t_token] = r_session_token
                    if ( sess_token_set := tts._sessions_to_their_tokens[y_session_token] ) {
                        sess_token_set.session_carries.insert(t_token)
                        tts._token_to_owner[t_token] = receiver_key
                    }
                }
            }
        }
    }  // no else --- there has to be an agent to transfer the ownerhip of a token
}



// CHANGED
fn (tts TokenTablesStruct) destroy_token( token & TransitionToken) {
}
fn (tts TokenTablesStruct) destroy_token(t_token TransitionToken) {
    if ( session_token := tts._token_to_session[t_token]) {
        tts._token_to_session.delete(t_token)
        tts._db.del_key_value(t_token)
        tts._token_to_owner.delete(t_token)
        //
        if ( sess_token_set := tts._sessions_to_their_tokens[session_token] ) {
            sess_token_set.session_bounded.delete(t_token)
            sess_token_set.session_carries.delete(t_token)
        }
    }
}


//
fn (tts TokenTablesStruct)set_general_session_timeout( timeout i32) {
}

fn (tts TokenTablesStruct)set_session_timeout( session_token & SessionToken, timeout i32) {
}

fn (tts TokenTablesStruct)get_session_timeout( session_token & SessionToken) ?i32 {
}

fn (tts TokenTablesStruct)get_session_time_left( session_token & SessionToken) ?i32 {
}

//
fn (tts TokenTablesStruct)set_general_token_timeout( timeout i32) {
}

fn (tts TokenTablesStruct)set_disownment_token_timeout( t_token & TransitionToken, timeout i32) {
}

fn (tts TokenTablesStruct)set_token_timeout( t_token & TransitionToken,timeout i32) {
}

fn (tts TokenTablesStruct)get_token_timeout( t_token & TransitionToken) ?i32 {
}

fn (tts TokenTablesStruct)get_token_time_left( t_token & TransitionToken)   ?i32 {
}

fn (tts TokenTablesStruct)set_token_sellable( t_token & TransitionToken, amount Optional[f32]) {
}

fn (tts TokenTablesStruct)unset_token_sellable( t_token & TransitionToken) {
}


//
fn (tts TokenTablesStruct)reload_session_info( session_token & SessionToken, ownership_key & Ucwid, hash_of_p2 Hash) bool {
}
// Promise<boolean>   async 


fn (tts TokenTablesStruct)reload_token_info( t_token & TransitionToken) {
}    // Promise<void>  async 
//


fn (tts TokenTablesStruct)list_tranferable_tokens( session_token & SessionToken) []TransitionToken {
}


fn (tts TokenTablesStruct)list_sellable_tokens() []TransitionToken {
}


fn (tts TokenTablesStruct)list_unassigned_tokens() []TransitionToken {
}


fn list_detached_sessions() []]SessionToken {
}




















// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

fn main() {
    /*
    s := '[{"name":"Frodo", "age":25}, {"name":"Bobby", "age":10}]'
    mut users := json.decode([]User, s) or {
        eprintln('Failed to parse json')
        return
    }
    for user in users {
        println('${user.name}: ${user.age}')
    }
    println('')
    for i, mut user in users {
        println('${i}) ${user.name}')
        if !user.can_register() {
            println('Cannot register ${user.name}, they are too young')
            continue
        }
		// `user` is declared as `mut` in the for loop,
		// modifying it will modify the array
        user.register()
    }
    // Let's encode users again just for fun
    println('')
    println(json.encode(users))
    */
}

