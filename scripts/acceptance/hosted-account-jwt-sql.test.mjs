import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSql, literal, catalogSql } from './hosted-account-jwt-sql.mjs';
import { withDisposablePostgres, psql } from '../../../Ante/scripts/backend/integration/disposable-postgres.mjs';
const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const f={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',email:`ante-jwt-${runId}-a@example.invalid`,createdAt:'2026-09-27T00:00:01Z'};
let sql;
test('real PostgreSQL guards exact profile deletion, cascades, ownership, and preserves unrelated rows',async(t)=>{
  const c=await withDisposablePostgres(t,'account-jwt');
  await psql(c,`CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA profile_asset_private; CREATE SCHEMA profile_name_private; CREATE SCHEMA ante_presets_private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,created_at timestamptz);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users,email text,waitlist_status text,stripe_customer_id text,avatar_url text);
    CREATE TABLE public.tasks(user_id uuid REFERENCES public.profiles);
    CREATE TABLE public."tasks to verify"("sent by" uuid REFERENCES public.profiles);
    CREATE TABLE public."friend pairs"(friend_1 uuid REFERENCES public.profiles,friend_2 uuid REFERENCES public.profiles);
    CREATE TABLE public.payment_methods(user_id uuid REFERENCES public.profiles ON DELETE CASCADE);
    CREATE TABLE public.payment_holds(user_id uuid REFERENCES public.profiles ON DELETE CASCADE);
    CREATE TABLE public.notifications(user_id uuid REFERENCES auth.users ON DELETE CASCADE,related_user_id uuid REFERENCES auth.users ON DELETE CASCADE);
    CREATE TABLE profile_asset_private.heads(owner_id uuid);
    CREATE TABLE profile_asset_private.operations(owner_id uuid);
    CREATE TABLE profile_name_private.owner_limits(owner_id uuid REFERENCES auth.users ON DELETE CASCADE);
    CREATE TABLE ante_presets_private.owner_presets(owner_id uuid REFERENCES auth.users ON DELETE CASCADE);
    CREATE TABLE storage.objects(owner uuid,owner_id text,name text);
    CREATE TABLE storage.buckets(owner uuid,owner_id text);
    CREATE TABLE storage.s3_multipart_uploads(owner_id text,key text);
    CREATE TABLE storage.s3_multipart_uploads_parts(owner_id text,key text);
    INSERT INTO auth.users VALUES ('${f.id}',${literal(f.email)},'{"acceptance_run":"${runId}"}','${f.createdAt}'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','real@example.invalid','{}',now());
    INSERT INTO profiles SELECT id,email,'standard',null,null FROM auth.users;`);
  sql=fixtureSql(f,runId,'2026-09-27T00:00:00Z',await psql(c,catalogSql));
  const drift=fixtureSql(f,runId,'2026-09-27T00:00:00Z','0'.repeat(64));
  await assert.rejects(psql(c,`BEGIN; ${drift.remove}; COMMIT;`),/catalog drift/);
  for(const [table,column] of [['payment_methods','user_id'],['payment_holds','user_id'],['notifications','related_user_id'],['profile_asset_private.heads','owner_id'],['profile_asset_private.operations','owner_id']]) {
    await psql(c,`INSERT INTO ${table}(${column}) VALUES ('${f.id}')`);
    await assert.rejects(psql(c,`BEGIN; ${sql.remove}; COMMIT;`),/protected fixture references/);
    assert.equal(await psql(c,`SELECT count(*) FROM profiles`),'2');
    assert.equal(await psql(c,`SELECT count(*) FROM ${table}`),'1');
    await psql(c,`DELETE FROM ${table}`); // Disposable synthetic fixture only.
  }
  await psql(c,`INSERT INTO storage.objects(name) VALUES ('photos/${f.id}/test')`);
  await assert.rejects(psql(c,`BEGIN; ${sql.remove}; COMMIT;`),/protected fixture references/);
  await psql(c,'DELETE FROM storage.objects');
  await psql(c,`UPDATE auth.users SET raw_app_meta_data='{}' WHERE id='${f.id}'`);
  await assert.rejects(psql(c,`BEGIN; ${sql.remove}; COMMIT;`),/ownership mismatch/);
  await psql(c,`UPDATE auth.users SET raw_app_meta_data='{"acceptance_run":"${runId}"}' WHERE id='${f.id}'`);
  await psql(c,`BEGIN; ${sql.remove}; COMMIT;`);
  assert.equal(await psql(c,'SELECT count(*) FROM profiles'),'1');
  assert.equal(await psql(c,'SELECT count(*) FROM auth.users'),'2');
  assert.equal(await psql(c,`SELECT email FROM profiles`),'real@example.invalid');
  await psql(c,`BEGIN; ${sql.remove}; COMMIT;`); // Idempotent exact profile absence.
  // The profile is absent: the read-only ownership gate must still reject SQL UNKNOWN.
  for(const assignment of ["raw_app_meta_data='{}'", "raw_app_meta_data='{\"acceptance_run\":null}'", 'raw_app_meta_data=NULL', 'email=NULL']) {
    await psql(c,`UPDATE auth.users SET email=${literal(f.email)},raw_app_meta_data='{\"acceptance_run\":\"${runId}\"}' WHERE id='${f.id}'; UPDATE auth.users SET ${assignment} WHERE id='${f.id}'`);
    const evidence=JSON.parse(await psql(c,`SELECT row_to_json(e) FROM (${sql.inspect}) e`));
    assert.equal(evidence.auth,1);assert.equal(evidence.profile,0);assert.equal(evidence.owned,false,assignment);
    const {cleanupFixture}=await import('./hosted-account-jwt.mjs');let deletes=0;
    await assert.rejects(cleanupFixture(f,{inspect:async()=>evidence,removeProfile:async()=>{deletes++;},deleteUser:async()=>{deletes++;},save:async()=>{}}));
    assert.equal(deletes,0);
  }
});
