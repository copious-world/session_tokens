
type Hash = string;
type SessionToken = string;
type TransitionToken = string
type Ucwid = string


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

export interface DB {
    set_session_key_value : (session_token : SessionToken, ownership_key : Ucwid) => Hash;
    del_session_key_value : (session_token : SessionToken) => Promise<boolean>;
    set_key_value : (t_token : TransitionToken, value :string) => void;
    get_key_value : (t_token : TransitionToken) => Promise<string | boolean>;
    del_key_value : (t_token : TransitionToken) => void;
    check_hash  :   (hh_unidentified : string, ownership_key : Ucwid) => Promise<boolean>;
}

