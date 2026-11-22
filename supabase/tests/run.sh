#!/usr/bin/env bash
# Roda 0001 + migrações da frente C + testes em um Postgres 16 temporário (porta 54323).
set -u
[ "$(id -u)" -eq 0 ] && exec runuser -u postgres -- "$0" "$@"
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/tmp/pgC
PORT=54323
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TESTS="$ROOT/supabase/tests"
MIG="$ROOT/supabase/migrations"
export PGHOST=/tmp PGPORT=$PORT PGUSER=postgres
PSQL="$PGBIN/psql -X -q -v ON_ERROR_STOP=1"

cleanup() { $PGBIN/pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1; rm -rf "$PGDATA"; }
trap cleanup EXIT
rm -rf "$PGDATA"
$PGBIN/initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null || exit 2
$PGBIN/pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -l /tmp/pgC.log -w start >/dev/null || exit 2
$PGBIN/createdb mc || exit 2
export PGDATABASE=mc

fail=0
echo "== setup =="
for f in "$TESTS/00_stub.sql" "$MIG"/0[0-9][0-9][0-9]_*.sql "$TESTS/01_helpers.sql"; do
  echo "-- $(basename "$f")"
  $PSQL -f "$f" 2>&1 | grep -v '^$' ; [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "ERRO no setup: $f"; exit 1; }
done

echo "== testes SQL =="
pass=0
for f in "$TESTS"/[1-9]*_*.sql; do
  out=$($PSQL -f "$f" 2>&1); rc=$?
  n=$(grep -c 'ok - ' <<<"$out")
  if [ $rc -eq 0 ]; then echo "PASS $(basename "$f") ($n asserções)"; pass=$((pass+n))
  else echo "FAIL $(basename "$f")"; echo "$out" | tail -8; fail=1; fi
done

echo "== concorrência: última vaga da janela =="
$PSQL -o /dev/null <<'SQL'
begin;
select t.mk_customer(1); select t.mk_customer(2);
select t.mk_book('C1',1); select t.mk_book('C2',1);
select t.login(t.uid(1)); select reserve_book((select id from books where title='C1')); select t.logout();
select t.login(t.uid(2)); select reserve_book((select id from books where title='C2')); select t.logout();
select t.mk_window(1);
commit;
SQL
W=$($PSQL -At -c "select id from delivery_windows order by id desc limit 1")
A1=$($PSQL -At -c "select id from addresses where customer_id=t.uid(1)")
A2=$($PSQL -At -c "select id from addresses where customer_id=t.uid(2)")
( $PSQL -c "begin; select t.login(t.uid(1)); select schedule_visit($W,'$A1',null); select pg_sleep(2); commit;" >/tmp/pgC_s1.out 2>&1 ) &
sleep 0.7
$PSQL -c "begin; select t.login(t.uid(2)); select schedule_visit($W,'$A2',null); commit;" >/tmp/pgC_s2.out 2>&1
wait
n=$($PSQL -At -c "select count(*) from visits where window_id=$W")
if [ "$n" = "1" ] && grep -q 'lotada' /tmp/pgC_s2.out && ! grep -q ERROR /tmp/pgC_s1.out; then
  echo "PASS concorrência (sessão 2 bloqueou e foi rejeitada: janela lotada; visitas=$n)"; pass=$((pass+1))
else echo "FAIL concorrência (visitas=$n)"; cat /tmp/pgC_s1.out /tmp/pgC_s2.out; fail=1; fi

echo "== resumo: $pass asserções ok, falhas=$fail =="
exit $fail
