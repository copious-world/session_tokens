#include <algorithm>
#include <functional>
#include <iostream>
#include <optional>
#include <string>
#include <map>
#include <set>
#include <vector>
#include <variant>
//
#include <sstream>
#include <random>
#include <climits>

using namespace std;

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


typedef string  Hash;
typedef string  Ucwid;

const char * SESSION_PEFIX = "user+";


class Token : public string {
public:
    Token() : string() {}
    Token(string val) : string(val) { }
};


class SessionToken : public Token {
public:
    SessionToken() : Token() { }
    SessionToken(string val) : Token(val) { }
};


class TransitionToken : public Token {
public:
    TransitionToken() : Token() { }
    TransitionToken(string val) : Token(val) { }
};


template <typename T>
using StructOrString = typename variant<T>::StructOrString;

typedef Token * (*token_lambda)(string);

class SessionTokenTraits {
public:
    virtual void clear() = 0;
};


class DB {
public:
    virtual Hash                set_session_key_value( SessionToken & session_token, Ucwid &ownership_key ) = 0;
    virtual bool                del_session_key_value(SessionToken & session_token) = 0;
    virtual void                set_key_value(TransitionToken & token, string & value) = 0;
    virtual optional<string>    get_key_value(TransitionToken & token) = 0;
    virtual void                del_key_value(TransitionToken  & token);
    virtual bool                check_hash(string &hh_unidentified, Ucwid &ownership_key) = 0;
};


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----



inline unsigned char random_char() {
    random_device rd;
    mt19937 gen(rd()); 
    uniform_int_distribution<> dis(0, 255);
    return static_cast<unsigned char>(dis(gen));
}

inline string gen_random_str(const unsigned int len) {
    stringstream ss;
    for( auto i = 0; i < len; i++) {
        auto rc = random_char();
        stringstream hexstream;
        hexstream << hex << int(rc);
        auto hex = hexstream.str(); 
        ss << (hex.length() < 2 ? '0' + hex : hex);
    }        
    return ss.str();
}


inline string uuid() {
    string rbytes = gen_random_str(8);
    rbytes += '-';
    rbytes += gen_random_str(4);
    rbytes += "-4";
    rbytes += gen_random_str(3);
    uint8_t y = random_char();
    y = ((y & 0x3) | 0x8);
    //
    stringstream hexstream;
    hexstream << hex << int(y);
    auto hex = hexstream.str(); 
    //
    rbytes += hex;
    rbytes += gen_random_str(3);
    rbytes += '-';
    rbytes += gen_random_str(12);
    return rbytes;
}


Token *default_token_maker(string & prefix) {
    string rstr = uuid();
    //
    if ( prefix.size() ) {
        const string prfx(prefix);  // value
        if (prfx == SESSION_PEFIX) {
            SessionToken *st = new SessionToken(prfx + rstr);
            return st;
        } else {
            TransitionToken *tt = new TransitionToken(prfx + rstr);
            return tt;
        }
    } else {
        TransitionToken *tt = new TransitionToken(rstr);
        return tt;
    }
}


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


template<class T>
class TokenTables {
    typedef T Jsonable;
public:
    //
    TokenTables(DB *db,optional<token_lambda> token_creator) {
        _db = db;
        if ( token_creator ) {
            _token_maker = *token_creator;
        } else {
            _token_maker = default_token_maker;
        }
    }
    virtual ~TokenTables() {}
    //
    virtual Token create_token(optional<string>  & prefix) = 0;
    virtual void add_token(TransitionToken & t_token, StructOrString<Jsonable>  &value) = 0;
    //
    virtual  optional<string> transition_token_is_active(TransitionToken & t_token) = 0;
    virtual  void destroy_token(TransitionToken & t_token) = 0;
    virtual  Ucwid from_token(TransitionToken & t_token) = 0;
    //
    virtual  void add_session(SessionToken & session_token, Ucwid & ownership_key, optional<TransitionToken>  & o_t_token) = 0;
    virtual  optional<bool> active_session(SessionToken & session_token, Ucwid & ownership_key) = 0;
    virtual  void destroy_session(TransitionToken & t_token) = 0 ;
    virtual  void add_transferable_token(TransitionToken & t_token, StructOrString<Jsonable> value, Ucwid  & ownership_key) = 0;
    virtual void transfer_token(TransitionToken & t_token, Ucwid & yielder_key,  Ucwid & receiver_key ) = 0;
public:
    DB                  *_db;
    token_lambda        _token_maker;
};



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----


struct SessionTokenSets {
    set<TransitionToken> session_bounded;
    set<TransitionToken> session_carries;
};


class SessionTokenManager : public SessionTokenSets, public SessionTokenTraits {
public:

    SessionTokenManager() {}
    virtual ~SessionTokenManager() {}

    void clear(){
        this->session_bounded.clear();
        this->session_carries.clear();
    }
};


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

template<class T>
class LocalSessionTokens : public TokenTables<T> {

    typedef T Jsonable;
    //
public:

    LocalSessionTokens(DB &db,optional<token_lambda>& token_creator) : TokenTables<T>(db,token_creator) {
    }
    virtual ~LocalSessionTokens() {}

public:

    map<SessionToken,Ucwid>                 _session_to_owner;
    map<Ucwid,SessionToken>                 _owner_to_session;  
    map<Token,Ucwid>                        _token_to_owner;
    map<TransitionToken,SessionToken>       _token_to_session;
    map<SessionToken,string>                _session_checking_tokens;
    map<TransitionToken,string>             _token_to_information;
    map<SessionToken,SessionTokenManager>   _sessions_to_their_tokens;

public:

    virtual Token create_token(optional<string>  & prefix) {
        return this._token_maker(prefix);
    }

    virtual void add_token(TransitionToken & t_token, StructOrString<Jsonable>  & value) {
        //
        string tval;
        if ( holds_alternative<string>(value) ) {
            tval = get<string>(value);
        } else {
            T *j = get<Jsonable>(value);
            tval = j.serialize();
        }
        //
        DB *db = this->_db;
        if ( db ) db->set_key_value(t_token,tval);
        _token_to_information[t_token] = tval;
    }

    //
    virtual optional<string> transition_token_is_active(TransitionToken & t_token) {
        if ( auto search = _token_to_information.find(t_token); search != _token_to_information.end() ) {
            string value = search->second;
            return value;
        } else {
            DB *db = this->_db;
            optional<string> dbval = db ? db->get_key_value(t_token) : nullopt;
            if ( dbval ) {
                string value = *dbval;
                this->add_token(t_token,value);
                return value;
            } else {
                return {};
            }
        }
    }

    virtual void destroy_token(TransitionToken & t_token) {

        if ( auto search = _token_to_session.find(t_token); search != _token_to_session.end() ) {
            SessionToken session_token = *search;
            if ( auto set_tok_ref = _sessions_to_their_tokens.find(t_token); set_tok_ref != _sessions_to_their_tokens.end() ) {
                SessionTokenManager &stm_ref = set_tok_ref->second;
                stm_ref.clear();
            }
            DB *db = this->_db;
            if ( db ) db->del_key_value(t_token);
            if ( auto osearch = _token_to_owner.find(t_token); osearch != _token_to_owner.end() ) {
                _token_to_owner.erase(osearch);
            }
        }
        //
        if ( auto search = _token_to_session.find(t_token); search != _token_to_session.end() ) {
            _token_to_session.erase(search);
        }

    }

    virtual Ucwid from_token(TransitionToken & t_token) {
        if ( auto toko_search = _token_to_owner.find(t_token); toko_search != _token_to_owner.end() ) {
            Ucwid owner = *toko_search;
            return owner;
        }
        return "";
    }

    //
    virtual void add_session(SessionToken & session_token, Ucwid & ownership_key, optional<TransitionToken>  & o_t_token) {
        DB *db = this->_db;
        if ( db ) {
            Hash hash_of_p2 =db->set_session_key_value(session_token,ownership_key);
            _session_to_owner[session_token] = ownership_key;
            _session_checking_tokens[session_token] = hash_of_p2;
            _token_to_owner[session_token] = ownership_key;
            SessionTokenManager &stm_ref = _sessions_to_their_tokens[session_token];
            if ( o_t_token ) {
                TransitionToken t_token = *o_t_token;
                _token_to_session[t_token] = session_token;
                stm_ref.session_bounded.insert(t_token);
                _token_to_owner[t_token] = ownership_key;
                this->add_token(t_token, ownership_key);
            }
        }
    }


    virtual optional<bool> active_session(SessionToken & session_token, Ucwid & ownership_key) {
        if ( auto sct_search = _session_checking_tokens.find(session_token); sct_search != _session_checking_tokens.end() ) {
            string hh_unidentified = *sct_search;
            DB *db = this->_db;
            bool truth = db ? db->check_hash(hh_unidentified,ownership_key) : false;
            return truth;
        }
        return {};
    }

    virtual void destroy_session(TransitionToken & t_token) {

        if ( auto sess_search = _token_to_session.find(t_token); sess_search != _token_to_session.end() ) {
            SessionToken session_token = *sess_search;
            if ( auto o_search = _session_to_owner.find(t_token); o_search != _session_to_owner.end() ) {
                _session_to_owner.erase(o_search);
            }
            if ( auto sct_search = _session_checking_tokens.find(t_token); sct_search != _session_checking_tokens.end() ) {
                _session_checking_tokens.erase(sct_search);
            }
            if ( auto toko_search = _token_to_owner.find(t_token); toko_search != _token_to_owner.end() ) {
                _token_to_owner.erase(toko_search);
            }
            if ( auto set_tok_ref = _sessions_to_their_tokens.find(t_token); set_tok_ref != _sessions_to_their_tokens.end() ) {
                SessionTokenManager &stm_ref = set_tok_ref->second;
                stm_ref.clear();
            }
            DB *db = this->_db;
            if( db ) db->del_session_key_value(session_token);
        }
    }

    virtual void add_transferable_token(TransitionToken & t_token, StructOrString<Jsonable> value, Ucwid & ownership_key) {
        //
        if ( auto sess_search = _owner_to_session.find(ownership_key); sess_search != _owner_to_session.end() ) {
            SessionToken session_token = *sess_search;
            if ( auto set_tok_ref = _sessions_to_their_tokens.find(session_token); set_tok_ref != _sessions_to_their_tokens.end() ) {
                SessionTokenManager &stm_ref = set_tok_ref->second;
                stm_ref.session_carries.insert(t_token);
                _token_to_session[t_token] = session_token;
                this->add_token(t_token,value);
            }
        }

    }

    virtual void transfer_token(TransitionToken & t_token, Ucwid & yielder_key, Ucwid & receiver_key ) {
        if ( auto sess_search = _owner_to_session.find(yielder_key); sess_search != _owner_to_session.end() ) {
            SessionToken ysst = *sess_search;
            if ( auto set_tok_ref = _sessions_to_their_tokens.find(ysst); set_tok_ref != _sessions_to_their_tokens.end() ) {
                SessionTokenManager &stm_ref = set_tok_ref->second;
                if ( stm_ref.session_carries.contains(t_token) ) {
                    this->destroy_token(t_token);
                    if ( auto rsess_search = _owner_to_session.find(receiver_key); rsess_search != _owner_to_session.end() ) {
                        SessionToken rsst = *rsess_search;
                        _token_to_session[t_token] = rsst;
                        if ( auto rset_tok_ref = _sessions_to_their_tokens.find(rsst); rset_tok_ref != _sessions_to_their_tokens.end() ) {
                            SessionTokenManager &rstm_ref = rset_tok_ref->second;
                            rstm_ref.session_carries.insert(t_token);
                            _token_to_owner[t_token] = receiver_key;
                        }
                    }
                }
            }
        }
    }
};









int main(int argc, char **argv){

    cout << "Hello from: " << argv[0] << endl;

    return 0;
}

