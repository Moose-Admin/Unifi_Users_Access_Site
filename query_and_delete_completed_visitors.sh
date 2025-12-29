#!/bin/bash

# API Endpoint and Authentication
VISITOR_API="https://10.10.10.1:12445/api/v1/developer/visitors"
AUTH_HEADER="Authorization: Bearer deN64WaTGT482FmJlb5PPQ"

# Get the current Unix timestamp (macOS compatible)
THIRTY_DAYS_AGO_TIMESTAMP=$(date -v-30d +%s)

echo "Fetching all visitors..."

# Fetch all visitors from the API
VISITOR_RESPONSE=$(curl -s -k "$VISITOR_API" -H "$AUTH_HEADER")

# Check for curl errors
if [ $? -ne 0 ]; then
  echo "Error: Failed to fetch data from the API."
  exit 1
fi

echo "Filtering for completed visitors older than 30 days..."

# Use jq to filter for completed visitors and extract their IDs into a bash array.
# macOS compatible array initialization using readarray (bash 4+) or while loop
COMPLETED_VISITOR_IDS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && COMPLETED_VISITOR_IDS+=("$line")
done < <(echo "$VISITOR_RESPONSE" | jq -r --argjson thirtyDaysAgo "$THIRTY_DAYS_AGO_TIMESTAMP" '
  .data[] | 
  select(.end_time != null and .end_time < $thirtyDaysAgo) | 
  .id
')

# Get the count of visitors to delete
VISITOR_COUNT=${#COMPLETED_VISITOR_IDS[@]}

# If there are no visitors to delete, exit
if [ "$VISITOR_COUNT" -le 0 ]; then
  echo "No completed visitors found to delete."
  exit 0
fi

# Proceed with deletion without asking for confirmation
if true; then
  echo "Starting deletion..."
  
  # Loop through the array of IDs and delete each visitor
  for visitor_id in "${COMPLETED_VISITOR_IDS[@]}"; do
    if [ -n "$visitor_id" ]; then
      echo "Deleting visitor with ID: $visitor_id"
      
      # Construct the full API URL for deletion with is_force=true
      DELETE_URL="$VISITOR_API/$visitor_id?is_force=true"
      
      # Send the DELETE request
      response=$(curl -s -k -X DELETE "$DELETE_URL" -H "$AUTH_HEADER")
      
      # Display the response from the server
      echo "Response: $response"
      echo # Add a newline for better readability
    fi
  done
  
  echo "Deletion process completed."
else
  echo "Deletion cancelled."
fi
