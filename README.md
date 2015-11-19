Sqlata
======

I was looking for an SQL builder for Node.js, but I couldn't find something that suited my needs (that's usual to hear in this world, right?).

If you know anything that is similar to this project, please let me know.
Otherwise I'll keep developing this one for my (yet) pet project.

So these are the rules:

- A table, alias, query, or in general *relations* (as in relational algebra) are **Buildable**.
- A relation field or an applied SQL function/operator are **Expression** (which are **Buildable**)
- Everything else is a **Parameter** (which are **Expression**)
- It must read almost like SQL.
- It must be very easy to expand.

All of the examples below are in `showcase.js`.
    
Tables
------

Start defining a couple of tables:

```javascript
var Sql = require('./sql');
var user = Sql.table("user");
var article = Sql.table("article");
console.log(user.build());
```

```javascript
{ params: [], text: 'user' }
```

The `build()` method returns an object with the SQL (not necessarily correct) `text` and its `params`.

Select from
-----------

```javascript
var q = Sql.query().SELECT(user.star()).FROM(user);
console.log(q.build().text);
```

```sql
(SELECT (user.*) FROM user)
```

Ok that's valid SQL, even with the extra parenthesis.

Aliases
-------

```javascript
var a = article.alias();
var q = Sql.query().DISTINCT().SELECT(a.f("user_id")).FROM(a);
console.log(q.build().text);
```

```sql
(SELECT DISTINCT (t1.user_id) FROM article AS t1)
```

I really **don't** want to care about alias names.

Join
----

```javascript
var u1 = user.alias();
var u2 = user.alias();
var q = Sql.query()
.SELECT(u1.f("id"), u2.f("id"))
.FROM(u1)
.JOIN(u2, u1.f("name").EQ(u2.f("name")), "LEFT");
console.log(q.build().text);
```

```sql
(SELECT (t1.id), (t2.id) FROM user AS t1
 LEFT JOIN user AS t2 ON ((t1.name) = (t2.name)))
```

Params
------

```javascript
var a = article.alias();
var q = Sql.query().SELECT(a.f("title")).FROM(a).WHERE(a.f("user_id").EQ(123));
console.log(q.build());
```

```javascript
{ params: [ 123 ],
  text: '(SELECT (t1.title) FROM article AS t1 WHERE ((t1.user_id) = $1))' }
```

I really want to use parameters like that.

Literals
--------

When you don't want a parameter:
    
```javascript
var a = article.alias();
var q = Sql.query().FROM(a).WHERE(a.f("id").EQ(Sql.literal(123)));
console.log(q.build().text);
```

```sql
(SELECT * FROM article AS t1 WHERE ((t1.id) = 123))
```

Literals are usually necessary only to extend SQL syntax.

Functions
---------

```javascript
var a = article.alias();
var q = Sql.query().SELECT(Sql.count(a.f("user_id").DISTINCT())).FROM(a);
console.log(q.build().text);
```

```sql
(SELECT COUNT(DISTINCT (t1.user_id)) FROM article AS t1)
```

That method `distinct` is not proper but it's quite convenient.

Lists
-----

```javascript
var u = user.alias();
var q = Sql.query().FROM(u).WHERE(u.f("id").IN([2,4,6]));
console.log(q.build());
```

```javascript
{ params: [ 2, 4, 6 ], text: '(SELECT * FROM user AS t1 WHERE ((t1.id) IN ($1,$2,$3)))' }
```

Composing
---------

```javascript
var joinArticles = function(q, u) {
    var a = article.alias();
    q.JOIN(a, a.f("user_id").EQ(u.f("id")));
    return a;
};
var fooArticles = a => a.f("title").LIKE("%foo%");

var u = user.alias();
var q = Sql.query().DISTINCT().FROM(u);
var a = joinArticles(q, u);
q.WHERE(fooArticles(a));
console.log(q.build().text);
```

```sql
(SELECT DISTINCT * FROM user AS t1
 INNER JOIN article AS t2 ON ((t2.user_id) = (t1.id))
 WHERE ((t2.title) LIKE $1))

```

You may have more useful plans though.

Sharing parameters
------------------

In case you use the same parameter in more than one place:

```javascript
var u = user.alias();
var email = Sql.param("foo@foo");
var q = Sql.query().FROM(u).WHERE(u.f("login").EQ(email).OR(u.f("contact").EQ(email)));
console.log(q.build());
```

```javascript
{ params: [ 'foo@foo' ],
  text: '(SELECT * FROM user AS t1 WHERE (((t1.login) = $1) OR ((t1.contact) = $1)))' }
```

Complex example with custom functions
-------------------------------------

Users within 200 meters from a point, and json aggregate of their articles. Works with PostgreSQL.

```javascript
Sql.ST_Distance = Sql.func("ST_Distance");
Sql.ST_SetSRID = Sql.func("ST_SetSRID");
Sql.ST_POINT = Sql.func("ST_POINT");
Sql.COALESCE = Sql.func("COALESCE");
Sql.NULLIF = Sql.func("NULLIF");
Sql.json_agg = Sql.func("json_agg");
Sql.fixed_json_agg = e => Sql.COALESCE(Sql.NULLIF(Sql.json_agg(e).cast("TEXT"),
                                                  Sql.literal("'[null]'")),
                                       Sql.literal("'[]'")).cast("JSON");

var loc = { lat: 41.90278, lng: 12.49636 };

var u = user.alias();
var a = article.alias();
var q = Sql.query()
.SELECT(u.star(), Sql.fixed_json_agg(a.star()).alias("articles"))
.FROM(u)
.JOIN(a, a.f("user_id").EQ(u.f("id")))
.GROUP(u.f("id"))
.ORDER(u.f("name"))
.LIMIT(10);

var distance = Sql.ST_Distance(Sql.ST_SetSRID(Sql.ST_POINT(loc.lng, loc.lat), 4326),
                               u.f("address"), true);
q
.SELECT(distance.alias("distance"))
.WHERE(distance.LE(200));
console.log(q.build().text);
```

```sql
(SELECT (t1.*), (CAST (COALESCE(NULLIF((CAST (json_agg((t2.*)) AS TEXT)), '[null]'), '[]') AS JSON)) AS articles,
 ST_Distance(ST_SetSRID(ST_POINT($1, $2), $3), (t1.address), $4) AS distance
 FROM user AS t1
 INNER JOIN article AS t2 ON ((t2.user_id) = (t1.id))
 WHERE (ST_Distance(ST_SetSRID(ST_POINT($1, $2), $3), (t1.address), $4) <= $5)
 GROUP BY (t1.id) ORDER BY (t1.name) ASC LIMIT 10)
```

Simple concepts, powerful tool.

Note: the `fixed_json_agg` is because of this [annoying bug](http://stackoverflow.com/a/27179265/471622).

Insert/Update
-------------

```javascript
var ins = Sql.insert(user).set({ name: "foo" }).set("bio", "some info ehre").returning("id");
var upd = Sql.update(user).set("bio", "some info here").where(user.f("id").EQ(321));
console.log(ins.build());
console.log(upd.build());
```

```javascript
{ params: [ 'foo', 'some info ehre' ],
  text: 'INSERT INTO user (name, bio) VALUES ($1, $2) RETURNING id' }
{ params: [ 'some info here', 321 ],
  text: 'UPDATE user SET bio=$1 WHERE ((user.id) = $2)' }
```

TODO
====

More ANSI functions and operators. Support UNION, INTERSECT and anything else. Everything else.

Packaging
=========

I never packaged something for npm or bower, if you like to please file a PR. I will accept whatever.
