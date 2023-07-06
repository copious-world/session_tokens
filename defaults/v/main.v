import json
import rand


type Hash = string
type SessionToken = string
type TransitionToken = string
type Ucwid = string
type Token = TransitionToken | SessionToken

type Optional[T] = T | bool
type Varied = string | bool | int
type MapOrString =  string | map[string]Varied


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

interface DB {
mut:
    set_session_key_value(session_token SessionToken, ownership_key Ucwid) Hash
    del_session_key_value (session_token SessionToken) !bool
    set_key_value(t_token TransitionToken, value string)
    get_key_value(t_token TransitionToken) ?string
    del_key_value(t_token TransitionToken)
    check_hash(hh_unidentified string, ownership_key Ucwid) bool
}


/**
 * Management of session and their tokens.
 */

interface TokenTables {
    // new(mut db &DB, tlambda Optional[Token_lambda]) TokenTables
    create_token(prefix Optional[string]) Token
mut:
    add_token(token TransitionToken, value MapOrString )
    transition_token_is_active(token TransitionToken) ?string
    destroy_token(token TransitionToken)
    from_token(token TransitionToken) Ucwid

    add_session(session_token SessionToken, ownership_key Ucwid, o_t_token Optional[TransitionToken] )
    active_session(session_token SessionToken, ownership_key Ucwid) ?bool
    destroy_session(t_token TransitionToken)
    add_transferable_token(t_token TransitionToken, value MapOrString, ownership_key Ucwid )
    transfer_token(t_token TransitionToken, yielder_key Ucwid, receiver_key Ucwid )
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
    mut _db                                 &DB
    _token_lambda                           Token_lambda
    _session_to_owner                       map[SessionToken]Ucwid{}
    _owner_to_session                       map[Ucwid]SessionToken{}
    _token_to_owner                         map[Token]Ucwid{}
    _token_to_session                       map[TransitionToken]SessionToken{}
    _session_checking_tokens                map[SessionToken]string{}
    _token_to_information                   map[TransitionToken]string{}
    _sessions_to_their_tokens               map[SessionToken]SessionTokenSets{}
}

// MyStruct implements the interface Foo, but *not* interface Bar

fn new(mut db &DB, tlambda Optional[Token_lambda]) TokenTables {
    if tlambda is Token_lambda {
        return TokenTablesStruct{ _db : db, _token_lambda : tlambda }
    } else {
        return TokenTablesStruct{ _db : db, _token_lambda : default_token_maker }
    }
}

fun (mtt TokenTablesStruct) create_token(prefix Optional[string]) Token {
    return mtt._token_maker(prefix);
}
 
fn (mtt TokenTablesStruct) add_token(t_token TransitionToken, value MapOrString ) {
    if (  value !is 'string' ) {
        value = JSON.stringify(value)
    }
    mtt._db.set_key_value(t_token,value)
    mtt.token_to_information.insert(t_token,value)
}


fn (mtt TokenTablesStruct) transition_token_is_active(t_token TransitionToken) ?string {
    if ( token.len > 0 ) {
        value := mtt._token_to_information[token]
        if ( value.len > 0 ) {
            return value
        } else {
            key := await mtt._db.get_key_value(token)
            if ( key !is 'string' ) {
                return (false)
            } else {
                mtt.add_token(token,key)
                return (key)
            }
        }
    }
    return none
}


fn (mtt TokenTablesStruct) destroy_token(t_token TransitionToken) {
    if ( session_token := mtt._token_to_session[t_token]) {
        mtt._token_to_session.delete(t_token)
        mtt._db.del_key_value(t_token)
        mtt._token_to_owner.delete(t_token)
        //
        if ( sess_token_set := mtt._sessions_to_their_tokens[session_token] ) {
            sess_token_set.session_bounded.delete(t_token)
            sess_token_set.session_carries.delete(t_token)
        }
    }
}



fn (mtt TokenTablesStruct) from_token(t_token TransitionToken) Ucwid {
    return mtt._token_to_owner[t_token]
}


fn (mtt TokenTablesStruct) add_session(session_token SessionToken, ownership_key Ucwid, o_t_token Optional[TransitionToken] ) {
    hash_of_p2 := mtt._db.set_session_key_value(session_token,ownership_key)  // return hh unidentified == xxhash of value (value == ownership key)
    // later the session_token will be passed into get_session_key_value where it will be hashed into an augmented has token
    // for fetching hash_of_p2
    mtt._session_to_owner[session_token] = ownership_key // the session transition token 
    mtt._session_checking_tokens[session_token] = hash_of_p2
    mtt._token_to_owner[session_token] = ownership_key
    sess_token_set := SessionTokenSets()
    mtt._sessions_to_their_token[session_token] = sess_token_set
    //
    if ( t_token is TransitionToken ) {
        mtt._token_to_session[t_token] = session_token
        sess_token_set.session_bounded.isnert(t_token)
        mtt._token_to_owner[t_token] = ownership_key
        mtt.add_token(t_token, hash_of_p2)
    }
}



fn (mtt TokenTablesStruct) active_session(session_token SessionToken, ownership_key Ucwid) ?bool {
    if ( hh_unidentified := mtt._session_checking_tokens[session_token] ) {
        let truth = mtt._db.check_hash(hh_unidentified,ownership_key)
        return truth
    }
    return false
}


fn (mtt TokenTablesStruct) destroy_session(t_token TransitionToken) {
    if ( session_token := mtt._token_to_session[t_token] ) {
        mtt._session_to_owner.delete(session_token) // the session transition token 
        mtt._session_checking_tokens.delete(session_token)
        mtt._token_to_owner.delete(token)
        mtt._sessions_to_their_tokens.delete(session_token);
        mtt._db.del_session_key_value(session_token)
    }
}



fn (mtt TokenTablesStruct) add_transferable_token(t_token TransitionToken, value MapOrString, ownership_key Ucwid ) {
    if ( session_token := mtt._owner_to_session[ownership_key] ) {
        if ( sess_token_set := mtt._sessions_to_their_tokens[session_token] ) {
            mtt._token_to_session.[t_token] = session_token
            sess_token_set.session_carries.insert(t_token)
            await mtt.add_token(t_token,value)
        }
    }
}


fn (mtt TokenTablesStruct) transfer_token(t_token TransitionToken, yielder_key Ucwid, receiver_key Ucwid ) {
    if ( y_session_token := mtt._owner_to_session[yielder_key] ) {
        if ( sess_token_set := mtt._sessions_to_their_tokens[y_session_token] ) {
            if ( sess_token_set.session_carries.contains(t_token) ) {
                mtt.destroy_token(t_token)
                //  the receiver has to have an active session seen from this runtime
                if ( r_session_token := mtt._owner_to_session[receiver_key] ) {
                    mtt._token_to_session[t_token] = r_session_token
                    if ( sess_token_set := mtt._sessions_to_their_tokens[y_session_token] ) {
                        sess_token_set.session_carries.insert(t_token)
                        mtt._token_to_owner[t_token] = receiver_key
                    }
                }
            }
        }
    }  // no else --- there has to be an agent to transfer the ownerhip of a token
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

