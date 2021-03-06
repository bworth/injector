import { NON_ENUM_KEY_PREFIX, STR_REPLACE_TOKEN, deleteProperties, isObject } from './';

const CIRCULAR_DEPENDENCY = `Circular dependency detected while resolving "${ STR_REPLACE_TOKEN }"`;

function asConstant(value) {
	this.value = value;
}

function asMethodOf(owner) {
	deleteProperties(this);

	return Object.defineProperties(this, {
		owner: { value: owner },
		withContext: { configurable: true, value: withContext }
	});
}

function asPropertyOf(owner) {
	deleteProperties(this);
	Object.defineProperty(this, 'owner', { value: owner });
}

function usingConstructor(ctor) {
	deleteProperties(this);

	return Object.defineProperties(this, {
		ctor: { value: ctor },
		withArgs: { configurable: true, value: withArgs }
	});
}

function usingFactory(factory) {
	deleteProperties(this);

	return Object.defineProperties(this, {
		factory: { value: factory },
		withArgs: { configurable: true, value: withArgs },
		withContext: { configurable: true, value: withContext }
	});
}

function withArgs(...args) {
	deleteProperties(this, this.hasOwnProperty('context') ? [ 'withArgs', 'withContext' ] : [ 'withArgs' ]);

	return Object.defineProperty(this, 'args', { value: args });
}

function withContext(context) {
	deleteProperties(this, this.hasOwnProperty('args') ? [ 'withArgs', 'withContext' ] : [ 'withContext' ]);

	return Object.defineProperty(this, 'context', { value: context });
}

export default function injector(registration, context) {
	const dependencies = Object.create(Object.create(Object.prototype, {
		length: {
			get: function () {
				return Object.keys(this).length;
			}
		}
	}));
	const depPrototype = Object.create(Object.prototype, {
		value: {
			get: function () {
				return resolve(this);
			},
			set: function (value) {
				deleteProperties(this);
				Object.defineProperty(this, 'value', { value });
				Object.freeze(this);
			}
		}
	});
	const unresolved = {};

	function get(name) {
		const dep = dependencies[NON_ENUM_KEY_PREFIX + name];

		if (dep) {
			Object.defineProperty(dependencies, name, { enumerable: true, value: resolve(dep) });
			delete dependencies[NON_ENUM_KEY_PREFIX + name];
		}

		return dependencies[name];
	}

	function register(name) {
		const dep = Object.create(depPrototype, {
			name: { value: name },
			asConstant: { configurable: true, value: asConstant },
			asMethodOf: { configurable: true, value: asMethodOf },
			asPropertyOf: { configurable: true, value: asPropertyOf },
			usingConstructor: { configurable: true, value: usingConstructor },
			usingFactory: { configurable: true, value: usingFactory }
		});

		Object.defineProperty(dependencies, NON_ENUM_KEY_PREFIX + name, { configurable: true, value: dep });
		Object.defineProperty(dependencies, name, { configurable: true, enumerable: true, get: () => get(name) });

		return dep;
	}

	function resolve(dep) {
		if (depPrototype.isPrototypeOf(dep)) {
			if (unresolved[dep.name]) {
				throw new Error(CIRCULAR_DEPENDENCY.replace(STR_REPLACE_TOKEN,
						Object.keys(unresolved).concat(dep.name).join(', ')));
				delete unresolved[dep.name];
			} else {
				unresolved[dep.name] = true;
			}

			if (!dep.hasOwnProperty('value')) {
				if (typeof dep.factory === 'function') {
					dep.value = dep.factory.apply(dep.context || context, resolveArgs(dep.args));
				} else if (typeof dep.ctor === 'function') {
					dep.value = new dep.ctor(...resolveArgs(dep.args));
				} else if (dep.owner) {
					const owner = resolveArgs([ dep.owner ])[0];

					if (isObject(owner)) {
						const value = owner[dep.name];

						dep.value = (dep.context || context && typeof value === 'function') ?
								value.bind(dep.context || context) : value;
					}
				}
			}

			delete unresolved[dep.name];
		} else {
			dep = {};
		}

		return dep.value;
	}

	function resolveArgs(args) {
		args = Array.isArray(args) ? args : [];

		args.forEach((arg, i) => {
			if (typeof arg === 'string' && dependencies.hasOwnProperty(arg)) {
				args[i] = get(arg);
			}
		});

		return args;
	}

	if (typeof registration === 'function') {
		registration(register);
	}

	return Object.create(Object.prototype, {
		dependencies: { enumerable: true, value: dependencies }, get: { value: get }, register: { value: register }
	});
}
