#!/usr/bin/env bash
set -euo pipefail

: "${GCLOUD_PROJECT_ID:?Set GCLOUD_PROJECT_ID to the target Google Cloud project ID}"
: "${PRODUCT_FIRESTORE_DATABASE_ID:?Set PRODUCT_FIRESTORE_DATABASE_ID to the Firestore database ID}"

create_index() {
  local collection_group="$1"
  local output
  shift

  if ! output="$(
    gcloud firestore indexes composite create \
      --project="${GCLOUD_PROJECT_ID}" \
      --database="${PRODUCT_FIRESTORE_DATABASE_ID}" \
      --collection-group="${collection_group}" \
      --query-scope=collection \
      --async \
      --quiet \
      "$@" 2>&1
  )"; then
    if grep -Eqi 'already exists|ALREADY_EXISTS' <<<"${output}"; then
      echo "Index already exists for ${collection_group}; skipping."
      return 0
    fi

    echo "${output}" >&2
    return 1
  fi

  echo "${output}"
}

create_index companies \
  --field-config=field-path=active,order=ascending \
  --field-config=field-path=sortOrder,order=ascending

create_index categories \
  --field-config=field-path=active,order=ascending \
  --field-config=field-path=sortOrder,order=ascending

create_index categories \
  --field-config=field-path=active,order=ascending \
  --field-config=field-path=companyIds,array-config=contains \
  --field-config=field-path=sortOrder,order=ascending

filter_fields=(companyId categoryId subcategoryId inStock)
sort_fields=(nameNormalized nameNormalized price price)
sort_orders=(ascending descending ascending descending)

for mask in {0..15}; do
  for search_mode in without_search with_search; do
    for sort_index in {0..3}; do
      field_args=(--field-config=field-path=active,order=ascending)

      for filter_index in {0..3}; do
        if ((mask & (1 << filter_index))); then
          field_args+=(
            "--field-config=field-path=${filter_fields[filter_index]},order=ascending"
          )
        fi
      done

      if [[ "${search_mode}" == "with_search" ]]; then
        field_args+=(--field-config=field-path=searchPrefixes,array-config=contains)
      fi

      field_args+=(
        "--field-config=field-path=${sort_fields[sort_index]},order=${sort_orders[sort_index]}"
      )

      create_index products "${field_args[@]}"
    done
  done
done

echo "Submitted product catalog indexes. Monitor their build status in Firestore before importing products."
