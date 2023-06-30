# session_tokens

A collection of libraries that will manage session IDs in one process wih callouts to shared DB.

The aim here is to keep a logic for sessions and related tokens in one place for a number of implemtations.

The implementations vary in terms of the language of implementations, the types of data structures used, and relative efficiency.

## Defaults

The defaults are meant to be very simple implentations that can be used as standins for frameworks that need to be up and running but can use efficiency at some future date. The defaults require that the most basic data structures of the language can be used without any special library support, or as little as possible. 

All of the defaults expect an access to a DB object that provides in process or extra process DB interfaces. They leave most of the DB negotiation up to the interface and expect a particular library API will be provided to the through the DB object.

## Specializations
