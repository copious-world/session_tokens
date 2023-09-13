# session_tokens

A collection of libraries that will manage session IDs in one process with callouts to a shared DB.

The aim here is to keep a logic for sessions and related tokens in one place for a number of implementations.

The implementations vary in terms of the language used, the types of data structures used, and relative efficiency and security.

#### *<u>currently providing</u>*

* **JavaScript**	--	in use -- alpha
* **TypeScript**	-- producing JS
* **C++**		-- (work in progress: status - compiled module)
* **Rust**	-- (work in progress: status - compiled module)
* **V**		-- (work in progress: status - compiled module)

## install

* node.js

```
npm install -s session_tokens
```

* rust 

TBD

* C++

TBD

* V

TBD


## usage

**JavaScript** / **TypeScript**
>node.js
>
```
const sess_toks = require('session_token').defaults
```
>
>* ts 
>
```
import {defaults} from 'session_tokens' as sess_toks
```
>






## Defaults

The defaults are meant to be very simple implementations that can be used as stand-ins for frameworks that need to be up and running but could use efficiency at some future date. The defaults require that the most basic data structures of the language can be used without any special library support, or as little as possible. 

All of the defaults expect an access to a DB object that provides in process or extra process DB interfaces. They leave most of the DB negotiation up to the interface and expect a particular library API will be provided to the through the DB object.

## Specializations

(Currently - specializations are TBD).

Each language will have its own way of regulating memory, providing for map, sets, and lists. The defauls provided will make use of the implementations provided by each language. So, for JavaScript, Map objects, Set objects and the fundamental arrays `[]` and structs `{}` will be used. C++ will make use of `<map>` and `<set>` headers using namespace **std**. Rust will use HashSets and HashMaps from the collections module. (Etc.)

However, there may be a novel way to implement a hash map that performs significantly faster than the standard implementations, and/or that can be share between processes. Those implementations may be forwarded by this package or included as they are found or implemented.

### Tokens

In particular, **tokens**, including **session** ids, will require specialization by most applications. The default specializations use some form of random string delivered in an **uuid** format. This format is not likely to be unique nor very secure. So, all the implementations provide a means to supply an external method for token formation. In the following forms the reader will notice that a optiona prefix may be use in the construction of the token.

* **Rust**

A Token is either a transition token or a session token:

```
pub enum Token {
    SessionToken(SessionToken),
    TransitionToken(TransitionToken)
}
```

In Rust, a Token is returned from a Box'ed function, with an **Option**al prefix string as a parameter.

```
#[allow(non_camel_case_types)]
type token_lambda = Box<fn (Option<&str>) -> Token>;

```

* **V**

```
 type Token_lambda = fn (prefix Optional[string]) Token
```

* **C++**

The **Token** is treated as class inheritting from std::string.

```
class Token : public string {
public:
    Token() : string() {}
    Token(string val) : string(val) { }
};

```

Now, the `token_lambda` type is defined as returning a **Token** pointer.

```
typedef Token(*token_lambda)(string);
```

* **TypeScript**

```
type token_lambda = ( prefix? : string ) => Token;
```

* **JavaScript**

```
const default_token_maker = (prefix) => {
    let suuid = '' + uuid();
    let token = (prefix ? prefix : '') + suuid;
    return token;
}
```

## Asynchronocity

Where possible, callouts to the DB modules may be handled ansynchronously. Languages provide ways of indicating that a particular stack may wait until there is a response, allowing other operations to take place in the interim. 

In javascript and typescript, `async` and `await` is use for DB calls, and these propogate up to externalization. In Rust, certain methods will provide the `await` method for similar semantics. C++ in the later revisions also has calls similar to Rust

## Session and Tokens -- semantics

It is common for servers to work with session and tokens. A client will establish a **session** with a server through a process of authorization. Within the framework of a session, the users will make use of **tokens** in order to access resources. 

As a result of authorization, a user will be able associate his public identity with a session and with tokens. A server should be able to map from an owner identity to session or to tokens. Conversely, it should be able to map from tokens to owners. Also, a server should be able to identify the session from any token as well as from a session to all tokens.

Here is a table of mappings:

| Source       | Destination | arity       |
|--------------|-------------|-------------|
| owner id     | session     | one to one  |
| session      | owner id    | one to one  |
| token        | owner id    | one to one  |
| token        | session     | one to one  |
| session      | token       | one to many |
| owner id     | token       | one to many |

Note that session and tokens are both '*tokens*', but that this module makes a distinction between **session tokens** and **transition tokens**. Non-session tokens are called **transition tokens** because they will be used to make a state transition or a processor or the location of an asset under the aegis of a session.

### <u>session lifetime</u>

Typically, a session last from the time a user logs in until the user logs out or the session times out. But, some cases may require that a session stays active but detached, allowing the user to log back in occasionally to check on the progress of the session. It is completely up to the application to make a choice about how to manage this state of affairs.

This module provides methods to set and query the lifetime of a session. The methods have to be called to set behavior. A default behavior will be to limit the session to a period of time a default of one hour.

Here are some of the methods that may be invoked to manage session lifetimes:

* `add_session` 
* `active_session`
* `set_general_session_timeout` -- application supplied default
* `set_session_timeout` -- per session 
* `get_session_timeout` -- per session -- will be general if not set
* `get_session_time_left`
* `allow_session_detach` -- mark a session as detachable (not a default)
* `detach_session` -- keep a record that the session has been logged out
* `attach_session` -- keep a record that the session is logged in
* `destroy_session` -- this and all session bound tokens


`set_general_session_timeout` may be instructed to obtain the session timeout from the associated shared DB. It is possible to say that a session will never timeout until the server actively destroys it.

### <u>token lifetime</u>

Most tokens, **transition tokens**, will remain active only as long as the session is active. These tokens are said to be *session bound*. Some tokens, however, may be marked for release from a session with specific transfer to other sessions or owners (who may establish a session). Tokens may be transfered so that a process may be completed by more than one party.

Tokens may be assigned timeouts in a manner similar to sessions. Session bound tokens may be assigned timeouts longer than a session, but will be removed when a session ends. 

Transfer of tokens, not session bound, may involve business processes outside the scope of this module. However, a method is supplied to make a transfer within the runtime including this module. Methods are also supplied to mark a transfereable token as sellable or gifted. There may be processes that require a trasfer fee or cost. This module does not make a distinction about the direction money flows, it just marks that it may be flow for a particular token and provides a means to query that property. A positive or negative amount may be stored.

Here are some of the methods that may be invoked to manage token lifetimes:

* `set_general_token_timeout` -- application supplied default
* `set_disownment_token_timeout` -- the length of time a token may remain in tables waiting for transfer.
* `set_token_timeout` -- per token 
* `get_token_timeout` -- per token -- will be general if not set
* `get_token_time_left`
* `add_transferable_token` -- adds records for transferable tokens
* `add_token` -- adds a token to a map as a key to some information
* `transfer_token` -- transfers a token from one owner to another
* `destroy_token` -- removes a token from a session and ownership tables
* `set_token_sellable`
* `unset_token_sellable`
* `list_tranferable_tokens`
* `list_sellable_tokens`
* `list_unassigned_tokens` -- tokens yet to be transfered

When a session ends, transfereable tokens still in its tables will be assigned to a no-entity owner for some period of time. When conditions are right for the token transfer to complete, the server may the effect the transfer.


## Database Interface

DB interfaces are supplied in order to ensure that a session can last outside the 
lifetime of an executable, given that the excecutable may fail or that a session may be put on pause.
The DB interfaces also provides a formalism for sharing information between microservices.

>Applications using the TokenTables traits (interface) will need to supply a DB object that provide the traits (interface) DB methods set out in the interface definition below.

The DB interface specifies methods that handle different kinds of database relationships.
It is expected that the session keys will be in kind, while general tokens will be in 
another kind, a key value database for instance. Optionally, it can be a different kind of implementation,
for a key value stored, but if the same as for sessions, it is expected to be another instance.

Different applications may have different key value databases. For instance, 
some may be global persistence databases, while some may be shared memory caches, like those
provided by global_session. But, even if they are the same, the session data base will store a hash of data
identifying the session, while the token database will store actual values; where, the values stored in the database
may be keys or serializations of share token data.

Here is the **TypeScript** definition:

```
type Hash = string;
type SessionToken = string;
type TransitionToken = string
type Ucwid = string

export interface DB {
    set_session_key_value : (session_token : SessionToken, ownership_key : Ucwid) => Hash;
    del_session_key_value : (session_token : SessionToken) => Promise<boolean>;
    set_key_value : (t_token : TransitionToken, value :string) => void;
    get_key_value : (t_token : TransitionToken) => Promise<string | boolean>;
    del_key_value : (t_token : TransitionToken) => void;
    check_hash  :   (hh_unidentified : string, ownership_key : Ucwid) => Promise<boolean>;
}

```


Here it is again in **Rust**. It is clearer as to which methods require async handling.

```
#[async_trait]
pub trait DB<'a>: Sync + Send {
    async fn set_session_key_value(&self, session_token : & SessionToken, ownership_key : Ucwid ) -> Hash;
    fn del_session_key_value(&self, session_token : & SessionToken ) -> bool;
    fn set_key_value(&self, token : & TransitionToken, value : &str )  -> ();
    async fn get_key_value(&self, token : & TransitionToken )  -> Option<&str>;
    fn del_key_value(&self, token : & TransitionToken )  -> ();
    async fn check_hash(&self, hh_unidentified : &str, ownership_key : Ucwid )  -> bool;
}

```



## TokenTables Methods


Here is the Rust **TokenTables** trait.


```
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

```