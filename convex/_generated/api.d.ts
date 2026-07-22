/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as constants from "../constants.js";
import type * as emailAuth from "../emailAuth.js";
import type * as exercises from "../exercises.js";
import type * as favorites from "../favorites.js";
import type * as featureRequests from "../featureRequests.js";
import type * as fitness from "../fitness.js";
import type * as friends from "../friends.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as profiles from "../profiles.js";
import type * as prs from "../prs.js";
import type * as routines from "../routines.js";
import type * as seedData from "../seedData.js";
import type * as validation from "../validation.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  constants: typeof constants;
  emailAuth: typeof emailAuth;
  exercises: typeof exercises;
  favorites: typeof favorites;
  featureRequests: typeof featureRequests;
  fitness: typeof fitness;
  friends: typeof friends;
  history: typeof history;
  http: typeof http;
  migrations: typeof migrations;
  profiles: typeof profiles;
  prs: typeof prs;
  routines: typeof routines;
  seedData: typeof seedData;
  validation: typeof validation;
  workouts: typeof workouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
