/* UTILS */

function extendProto(o1, o2) {
	for (var k in o2) {
		if (!o1[k]) {
			o1[k] = o2[k];
		}
	}
}

function uppercaseProto(proto) {
	for (k in proto) {
		if (k != "toString" && k != "build") {
			proto[k.toUpperCase()] = proto[k];
		}
	}
}

function argsToArray(args) {
	return Array.prototype.slice.call(args);
}

function pushMany(a, list) {
	Array.prototype.push.apply(a, list);
}

/* SQL BUILDER */

var BuildableProto = {
	_sql_buildable: true,

	alias: function(name) {
		return Sql.alias(this, name);
	},
	
	build: function(startPos) {
		var state = { params: [], nextAlias: 1, nextPos: 1 };
		this.buildStep(state);
		state.text = this.toString();
		return state;
	},

	buildStep: function(state) {
		if (this.buildApply) {
			this.buildApply(state);
		}
		this.buildChildren(state);
	},

	buildChildren: function(state) {
		this._children.forEach(function(child) {
				child.buildStep(state);
		});
	}
};

/* TABLE*/

var Table = function(name) {
	this.name = name;
	this.literal = Sql.literal(name);
};

Table.prototype = {
	_children: [],

	f: function(field) {
		return this.literal.f(Sql.literal(field));
	},

	star: function() {
		return this.f("*");
	},
	
	toString: function() {
		return this.name;
	}
};

extendProto(Table.prototype, BuildableProto);

var Alias = function(rel, name) {
	this.rel = rel;
	this._children = [rel];
	this._applied = !!name;
	if (!name) {
		name = "a?";
	}
	this.alias = new Sql.literal(name);
};

Alias.prototype = {
	f: function(field) {
		return this.alias.f(Sql.literal(field));
	},

	star: function() {
		return this.f("*");
	},

	buildApply: function(state) {
		if (this._applied) {
			return;
		}
		
		this.alias.literal = "t"+(state.nextAlias++);
		this._applied = true;
	},

	toString: function() {
		return `${this.rel} AS ${this.alias}`;
	}
};

extendProto(Alias.prototype, BuildableProto);

/* QUERY */

var Join = function(expr, cond, type) {
	this.expr = expr;
	this.cond = cond;
	this.type = type || "INNER";
};

Join.prototype = {
	toString: function() {
		return `${this.type} JOIN ${this.expr} ON ${this.cond}`;
	}
};

var Order = function(expr, dir) {
	this.expr = expr;
	this.dir = dir || "ASC";
};

Order.prototype = {
	toString: function() {
		return `${this.expr} ${this.dir}`;
	}
};

var Query = function() {
	this._children = [];
	
	this._distinct = false;
	this._select = [];
	this._from = [];
	this._join = [];
	this._offset = null;
	this._limit = null;
	this._order = [];
	this._group = [];
	this._where = [];
};

Query.prototype = {
	select: function() {
		var exprs = makeChildren(argsToArray(arguments));
		pushMany(this._select, exprs);
		pushMany(this._children, exprs);
		return this;
	},

	distinct: function() {
		this._distinct = true;
		return this;
	},

	from: function() {
		var exprs = makeChildren(argsToArray(arguments));
		pushMany(this._from, exprs);
		pushMany(this._children, exprs);
		return this;
	},

	join: function(expr, cond, type) {
		this._join.push(new Join(expr, cond, type));
		this._children.push(expr);
		this._children.push(cond);
		return this;
	},

	order: function(expr, dir) {
		expr = makeChild(expr);
		this._order.push(new Order(expr, dir));
		this._children.push(expr);
		return this;
	},

	group: function() {
		var exprs = makeChildren(argsToArray(arguments));
		pushMany(this._group, exprs);
		pushMany(this._children, exprs);
		return this;
	},

	where: function(expr) {
		expr = makeChild(expr);
		this._where.push(expr);
		this._children.push(expr);
		return this;
	},

	limit: function(lit) {
		this._limit = Sql.literal(lit);
		return this;
	},

	offset: function(lit) {
		this._offset = Sql.literal(lit);
		return this;
	},

	toString: function() {
		var distinct = this._distinct ? ' DISTINCT' : '';
		var select = this._select.length ? ' '+this._select.join(', ') : ' *';
		var from = this._from.length ? ' FROM '+this._from.join(', ') : '';
		var join = this._join.length ? ' '+this._join.join(' ') : '';
		var where = this._where.length ? ' WHERE '+this._where.join(' AND ') : '';
		var group = this._group.length ? ' GROUP BY '+this._group.join(', ') : '';
		var order = this._order.length ? ' ORDER BY '+this._order.join(', ') : '';
		var limit = this._limit !== null ? ' LIMIT '+this._limit : '';
		var offset = this._offset !== null ? ' OFFSET '+this._offset : '';
		
		return `(SELECT${distinct}${select}${from}${join}${where}${group}${order}${limit}${offset})`;
	},
};

uppercaseProto(Query.prototype);
extendProto(Query.prototype, BuildableProto);

/* INSERT */

var Insert = function(rel) {
	this._children = [rel];

	this.rel = rel;
	this._data = {};
	this._returning = [];
};

Insert.prototype = {
	set: function(col, val) {
		if (typeof col == "string") {
			val = makeChild(val);
			this._data[col] = val;
			this._children.push(val);
		} else {
			for (k in col) {
				val = makeChild(col[k]);
				this._data[k] = val;
				this._children.push(val);
			}
		}

		return this;
	},

	returning: function() {
		var args = argsToArray(arguments);
		this._returning = args;
		return this;
	},
		
	toString: function() {
		var cols = [];
		var values = [];
		
		for (k in this._data) {
			cols.push(k);
			values.push(this._data[k]);
		}

		cols = cols.join(', ');
		values = values.join(', ');
		returning = this._returning.length ? ' RETURNING '+(this._returning.join(', ')) : '';
		
		return `INSERT INTO ${this.rel} (${cols}) VALUES (${values})${returning}`;
	},
};

uppercaseProto(Insert.prototype);
extendProto(Insert.prototype, BuildableProto);

/* UPDATE */

var Update = function(rel) {
	this._children = [rel];

	this.rel = rel;
	this._data = {};
	this._where = [];
	this._returning = [];
};

Update.prototype = {
	set: Insert.prototype.set,
	returning: Insert.prototype.returning,
	where: Query.prototype.where,
		
	toString: function() {
		var updates = [];
		
		for (k in this._data) {
			updates.push(k+'='+this._data[k]);
		}

		updates = updates.join(', ');
		var where = this._where.length ? ' WHERE '+this._where.join(' AND ') : '';
		var returning = this._returning.length ? ' RETURNING '+(this._returning.join(', ')) : '';
		
		return `UPDATE ${this.rel} SET ${updates}${where}${returning}`;
	},
};

uppercaseProto(Update.prototype);
extendProto(Update.prototype, BuildableProto);

/* DELETE */

var Delete = function(rel) {
	this._children = [rel];

	this.rel = rel;
	this._where = [];
};

Delete.prototype = {
	where: Query.prototype.where,
		
	toString: function() {
		if (!this._where.length) {
			throw new Error("Mass delete forbidden");
		}
		
		var where = this._where.length ? ' WHERE '+this._where.join(' AND ') : '';
		return `DELETE FROM ${this.rel}${where}`;
	},
};

uppercaseProto(Delete.prototype);
extendProto(Delete.prototype, BuildableProto);

/* EXPRESSIONS */

function makeChild(child, literalArgs) {
	if (Array.isArray(child)) {
		var list = { _children: makeChildren(child) };
		list.__proto__ = {
			toString: () => `(${list._children.join(',')})`
		}
		extendProto(list.__proto__, ExpressionProto);
		return list;
	}
	
	if (!child || !child._sql_buildable) {
		if (literalArgs) {
			return Sql.literal(child);
		} else {
			return Sql.param(child);
		}
	}

	return child;
}

function makeChildren(children, literalArgs) {
	return children.map(function(child) {
			return makeChild(child, literalArgs);
	});
}

function metaExpr(f, literalArgs) {
	return function() {
		var self = this;
		var args = Array.prototype.slice.call(arguments);
		args = makeChildren(args, literalArgs);
		
		var o = { _children: [self].concat(args) };
		o.__proto__ = {
			toString: function() {
				return f.apply(null, o._children);
			}
		};
		extendProto(o.__proto__, ExpressionProto);
		return o;
	}
}

var ExpressionProto = {
	not: metaExpr(e => `(NOT ${e})`),
	and: metaExpr((l,r) => `(${l} AND ${r})`),
	or: metaExpr((l,r) => `(${l} OR ${r})`),
	between: metaExpr((e,l,r) => `(${e} BETWEEN ${l} AND ${r})`),
	lt: metaExpr((l,r) => `(${l} < ${r})`),
	le: metaExpr((l,r) => `(${l} <= ${r})`),
	gt: metaExpr((l,r) => `(${l} > ${r})`),
	ge: metaExpr((l,r) => `(${l} >= ${r})`),
	eq: metaExpr((l,r) => `(${l} = ${r})`),
	ne: metaExpr((l,r) => `(${l} != ${r})`),
	in: metaExpr((l,r) => `(${l} IN ${r})`),
	like: metaExpr((l,r) => `(${l} LIKE ${r})`),
	ilike: metaExpr((l,r) => `(${l} ILIKE ${r})`),
	plus: metaExpr((l,r) => `(${l} + ${r})`),
	minus: metaExpr((l,r) => `(${l} - ${r})`),
	mult: metaExpr((l,r) => `(${l} * ${r})`),
	extract: metaExpr((d,f) => `(EXTRACT (${f} FROM ${d}))`, true),
	cast: metaExpr((e,t) => `(CAST (${e} AS ${t}))`, true),
	isnull: metaExpr(e => `(${e} IS NULL)`),
	notnull: metaExpr(e => `(${e} IS NOT NULL)`),
	exists: metaExpr(e => `(EXISTS ${e})`),
	notexists: metaExpr(e => `(NOT EXISTS ${e})`),
	distinct: metaExpr(e => `DISTINCT ${e}`),
	f: metaExpr((e,f) => `(${e}.${f})`)
};

uppercaseProto(ExpressionProto);
extendProto(ExpressionProto, BuildableProto);

/* CASE */

var When = function(cond, then) {
	this.cond = cond;
	this.then = then;
};

When.prototype = {
	toString: function() {
		return `WHEN ${this.cond} THEN ${this.then}`;
	}
};

var Case = function() {
	this._children = [];

	this._when = [];
	this._else = null;
};

Case.prototype = {
	when: function(cond, then) {
		cond = makeChild(cond);
		then = makeChild(then);
		this._when.push(new When(cond, then));
		this._children.push(cond);
		this._children.push(then);
		return this;
	},

	otherwise: function(expr) {
		expr = makeChild(expr);
		this._else = expr;
		this._children.push(expr);
		return this;
	},
	
	toString: function() {
		var when = this._when.join(" ");
		var otherwise = this._else ? ' ELSE '+this._else : '';

		return `CASE ${when}${otherwise} END`;
	}
};

extendProto(Case.prototype, ExpressionProto);

/* PARAMETER */

var Param = function(value) {
	this.param = "p?";
	this.value = value;
};

Param.prototype = {
	_children: [],
	
	buildApply: function(state) {
		if (!this._applied) {
			this.param = '$'+(state.nextPos++);
			state.params.push(this.value);
		}

		this._applied = true;
	},
	
	toString: function() {
		return this.param;
	}
};

extendProto(Param.prototype, ExpressionProto);

/* LITERAL */

var Literal = function(lit) {
	this.literal = lit;
};

Literal.prototype = {
	_children: [],
	toString: function() { return this.literal; }
};

extendProto(Literal.prototype, ExpressionProto);

/* FUNCTION CALL */

var Funcall = function(name, args) {
	this.name = name;
	this._children = makeChildren(args);
};

Funcall.prototype = {
	toString: function() {
		var args = this._children.join(', ');
		return `${this.name}(${args})`;
	}
};

extendProto(Funcall.prototype, ExpressionProto);

var Sql = {
	query: function() {
		return new Query();
	},

	insert: function(rel) {
		return new Insert(rel);
	},

	update: function(rel) {
		return new Update(rel);
	},

	deleteFrom: function(rel) {
		return new Delete(rel);
	},

	alias: function(rel, name) {
		return new Alias(rel, name);
	},

	table: function(name) {
		return new Table(name);
	},

	param: function(val) {
		return new Param(val);
	},

	literal: function(lit) {
		return new Literal(lit);
	},

	func: function(name) {
		return function() {
			return new Funcall(name, Array.prototype.slice.call(arguments));
		}
	},

	when: function(cond, then) {
		return new Case().when(cond, then);
	},

	metaExpr: metaExpr
};

/* COMMON FUNCTIONS */

Sql.now = Sql.func("NOW");
Sql.count = Sql.func("COUNT");

module.exports = Sql;
