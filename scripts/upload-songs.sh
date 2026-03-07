#!/bin/bash
# myol 曲アップロードスクリプト
# 使用方法: ./upload-songs.sh [file or directory]

set -e

BUCKET="${MYOL_DATA_BUCKET:-}"
REGION="${MYOL_AWS_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}}"
PREFIX="${MYOL_SONGS_PREFIX:-songs}"

if [ -z "$BUCKET" ]; then
  echo "環境変数 MYOL_DATA_BUCKET を設定してください" >&2
  exit 1
fi

upload_file() {
  local file="$1"
  local basename=$(basename "$file")
  local name="${basename%.*}"
  local key="${PREFIX}/${name}.cho"

  echo "Uploading: $file -> s3://${BUCKET}/${key}"
  aws s3 cp "$file" "s3://${BUCKET}/${key}" \
    --content-type "text/plain; charset=utf-8" \
    --region "$REGION"
}

if [ $# -eq 0 ]; then
  echo "使用方法: $0 <file or directory>"
  echo "例:"
  echo "  $0 ~/Downloads/song.txt"
  echo "  $0 ~/Downloads/*.txt"
  exit 1
fi

for arg in "$@"; do
  if [ -f "$arg" ]; then
    upload_file "$arg"
  elif [ -d "$arg" ]; then
    for f in "$arg"/*.txt; do
      [ -f "$f" ] && upload_file "$f"
    done
  else
    echo "スキップ: $arg (ファイルが見つかりません)"
  fi
done

echo ""
echo "=== アップロード完了 ==="
echo "確認: aws s3 ls s3://${BUCKET}/${PREFIX}/ --region ${REGION}"
