// Tables
var Sql = require('./sql');
var user = Sql.table("user");
var article = Sql.table("article");
console.log(user.build());

// Select from
var q = Sql.query().SELECT(user.star()).FROM(user);
console.log(q.build().text);

// Aliases
var a = article.alias();
var q = Sql.query().DISTINCT().SELECT(a.f("user_id")).FROM(a);
console.log(q.build().text);

// Join
var u1 = user.alias();
var u2 = user.alias();
var q = Sql.query().SELECT(u1.f("id"), u2.f("id")).FROM(u1).JOIN(u2, u1.f("name").EQ(u2.f("name")), "LEFT");
console.log(q.build().text);

// Params
var a = article.alias();
var q = Sql.query().SELECT(a.f("title")).FROM(a).WHERE(a.f("user_id").EQ(123));
console.log(q.build());

// Literals
var a = article.alias();
var q = Sql.query().FROM(a).WHERE(a.f("id").EQ(Sql.literal(123)));
console.log(q.build().text);

// Functions
var a = article.alias();
var q = Sql.query().SELECT(Sql.count(a.f("user_id").DISTINCT())).FROM(a);
console.log(q.build().text);

// Lists
var u = user.alias();
var q = Sql.query().FROM(u).WHERE(u.f("id").IN([2,4,6]));
console.log(q.build());

// Composing
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

// Sharing parameters
var u = user.alias();
var email = Sql.param("foo@foo");
var q = Sql.query().FROM(u).WHERE(u.f("login").EQ(email).OR(u.f("contact").EQ(email)));
console.log(q.build());

// Complex example with custom functions
Sql.ST_Distance = Sql.func("ST_Distance");
Sql.ST_SetSRID = Sql.func("ST_SetSRID");
Sql.ST_POINT = Sql.func("ST_POINT");
Sql.COALESCE = Sql.func("COALESCE");
Sql.NULLIF = Sql.func("NULLIF");
Sql.json_agg = Sql.func("json_agg");
Sql.fixed_json_agg = e => Sql.COALESCE(Sql.NULLIF(Sql.json_agg(e).cast("TEXT"), Sql.literal("'[null]'")), Sql.literal("'[]'")).cast("JSON");

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

var distance = Sql.ST_Distance(Sql.ST_SetSRID(Sql.ST_POINT(loc.lng, loc.lat), 4326), u.f("address"), true);
q
.SELECT(distance.alias("distance"))
.WHERE(distance.LE(200));
console.log(q.build().text);

// Insert/Update
var ins = Sql.insert(user).set({ name: "foo" }).set("bio", "some info ehre").returning("id");
var upd = Sql.update(user).set("bio", "some info here").where(user.f("id").EQ(321));
console.log(ins.build());
console.log(upd.build());
