# session_tokens

A collection of libraries that will manage session IDs in one process with callouts to a shared DB.

The aim here is to keep a logic for sessions and related tokens in one place for a number of implementations.

The implementations vary in terms of the language used, the types of data structures used, and relative efficiency and security.

#### *<u>currently providing</u>*

* **TypeScript**
* **JavaScript**
* **C++**
* **Rust**
* **V**

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

```
#[allow(non_camel_case_types)]
type token_lambda = Box<fn (Option<&str>) -> Token>;

```

* **V**

```
 type Token_lambda = fn (prefix Optional[string]) Token
```

* **C++**

```
typedef  Token * (* token_lambda)(optional<string>&);
```

* **TypeScript**

```
type token_lambda = ( prefix? : string ) => Token;
```

* **JavaScript

```
const default_token_maker = (prefix) => {
    let suuid = '' + uuid();
    let token = (prefix ? prefix : '') + suuid;
    return token;
}
```

## Asynchrnocity

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




