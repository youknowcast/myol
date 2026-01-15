#!/bin/bash
# myol インフラセットアップスクリプト
# 使用方法: ./setup.sh

set -e

BUCKET_NAME="myol.daycrift.net-data"
ROLE_NAME="myol-lambda-role"
LAMBDA_NAME="myol-presigned-url"
REGION="us-west-2"

echo "=== myol インフラセットアップ ==="

# 1. S3 バケット作成
echo "1. S3 バケット作成..."
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "   バケット $BUCKET_NAME は既に存在します"
else
  aws s3 mb "s3://$BUCKET_NAME" --region "$REGION"
  echo "   バケット $BUCKET_NAME を作成しました"
fi

# 2. CORS 設定
echo "2. CORS 設定..."
aws s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration file://cors.json
echo "   CORS 設定完了"

# 3. IAM ロール作成
echo "3. IAM ロール作成..."
if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  echo "   ロール $ROLE_NAME は既に存在します"
else
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document file://trust-policy.json
  echo "   ロール $ROLE_NAME を作成しました"
fi

# 4. IAM ポリシーアタッチ
echo "4. IAM ポリシー設定..."
aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name myol-s3-access \
  --policy-document file://s3-policy.json
echo "   ポリシー設定完了"

echo ""
echo "=== セットアップ完了 ==="
echo "次のステップ:"
echo "  1. lambda/presigned-url/function.json の Role ARN を更新"
echo "  2. cd lambda/presigned-url && npm install && npm run deploy"
echo "  3. Lambda 関数 URL を有効化"
echo "  4. .env の VITE_API_ENDPOINT を設定"
