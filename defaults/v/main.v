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
    //
    new(mut db &DB, tlambda Optional[Token_lambda]) TokenTables
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




// 
struct User {
    name string
    age  int
mut:
    is_registered bool
}

fn (u User) can_register() bool {
    return u.age >= 16
}

fn (mut u User) register() {
    u.is_registered = true
}




fn main() {
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
}

