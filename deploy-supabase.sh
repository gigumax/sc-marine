#!/usr/bin/env bash
# Deploy the static game to Supabase Storage as a public website.
#
# Usage:
#   SUPABASE_URL="https://YOUR-REF.supabase.co" \
#   SUPABASE_KEY="YOUR-SERVICE-ROLE-KEY" \
#   ./deploy-supabase.sh
#
# Optional: BUCKET="my-bucket" (default: starcraft-marine)
set -euo pipefail
cd "$(dirname "$0")"

BUCKET="${BUCKET:-starcraft-marine}"
: "${SUPABASE_URL:?Set SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co}"
: "${SUPABASE_KEY:?Set SUPABASE_KEY to your service_role key}"

mime() {
  case "$1" in
    *.html) echo "text/html" ;;
    *.css)  echo "text/css" ;;
    *.js)   echo "application/javascript" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

AUTH=(-H "Authorization: Bearer $SUPABASE_KEY" -H "apikey: $SUPABASE_KEY")

echo "==> Creating public bucket '$BUCKET' (ok if it exists)..."
curl -s -X POST "$SUPABASE_URL/storage/v1/bucket" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":true}" > /dev/null || true

# If the bucket already existed but wasn't public, make it public.
curl -s -X PUT "$SUPABASE_URL/storage/v1/bucket/$BUCKET" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"public":true}' > /dev/null || true

echo "==> Uploading files..."
find . -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' \) -not -path './.*' | sort | while read -r f; do
  rel="${f#./}"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$SUPABASE_URL/storage/v1/object/$BUCKET/$rel" \
    "${AUTH[@]}" \
    -H "Content-Type: $(mime "$rel")" \
    -H "x-upsert: true" \
    --data-binary "@$f")
  echo "  $code  $rel"
  [ "$code" = "200" ] || { echo "UPLOAD FAILED for $rel"; exit 1; }
done

echo
echo "==> LIVE:"
echo "    $SUPABASE_URL/storage/v1/object/public/$BUCKET/index.html"
echo "    (open that URL in a browser / Xbox Edge)"
