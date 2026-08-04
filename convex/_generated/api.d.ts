/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as challenges from "../challenges.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as emailAuth from "../emailAuth.js";
import type * as exercises from "../exercises.js";
import type * as favorites from "../favorites.js";
import type * as featureRequests from "../featureRequests.js";
import type * as feed from "../feed.js";
import type * as fitness from "../fitness.js";
import type * as friendThread from "../friendThread.js";
import type * as friends from "../friends.js";
import type * as friendships from "../friendships.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as pings from "../pings.js";
import type * as points from "../points.js";
import type * as profiles from "../profiles.js";
import type * as prs from "../prs.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as routines from "../routines.js";
import type * as seedData from "../seedData.js";
import type * as turnstile from "../turnstile.js";
import type * as validation from "../validation.js";
import type * as workoutFeedback from "../workoutFeedback.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  challenges: typeof challenges;
  constants: typeof constants;
  crons: typeof crons;
  emailAuth: typeof emailAuth;
  exercises: typeof exercises;
  favorites: typeof favorites;
  featureRequests: typeof featureRequests;
  feed: typeof feed;
  fitness: typeof fitness;
  friendThread: typeof friendThread;
  friends: typeof friends;
  friendships: typeof friendships;
  history: typeof history;
  http: typeof http;
  identity: typeof identity;
  messages: typeof messages;
  migrations: typeof migrations;
  notifications: typeof notifications;
  pings: typeof pings;
  points: typeof points;
  profiles: typeof profiles;
  prs: typeof prs;
  rateLimiter: typeof rateLimiter;
  routines: typeof routines;
  seedData: typeof seedData;
  turnstile: typeof turnstile;
  validation: typeof validation;
  workoutFeedback: typeof workoutFeedback;
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

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
