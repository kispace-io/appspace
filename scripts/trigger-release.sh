#!/bin/bash
set -e

# Load .env file if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Parse command-line arguments
DRY_RUN=false
VERSION_PART="patch"

for arg in "$@"; do
    case $arg in
        --dry-run|-n)
            DRY_RUN=true
            ;;
        major|minor|patch)
            VERSION_PART="$arg"
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--dry-run|-n] [major|minor|patch]"
            exit 1
            ;;
    esac
done

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN MODE - No changes will be pushed"
    echo ""
fi

echo "Incrementing $VERSION_PART version"

# Fetch latest tags from remote
echo "Fetching latest tags..."
git fetch --tags

# Get the latest tag (with or without 'v' prefix)
LATEST_TAG=$(git tag --sort=-v:refname | head -1)

if [ -z "$LATEST_TAG" ]; then
    echo "No tags found. Starting with version 0.1.0"
    NEXT_VERSION="0.1.0"
else
    echo "Latest tag: $LATEST_TAG"
    
    # Parse version parts (handle both v1.2.3 and 1.2.3 formats)
    if [[ $LATEST_TAG =~ ^v?([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        MAJOR="${BASH_REMATCH[1]}"
        MINOR="${BASH_REMATCH[2]}"
        PATCH="${BASH_REMATCH[3]}"
        
        # Increment the specified version part and reset lower parts
        case $VERSION_PART in
            major)
                MAJOR=$((MAJOR + 1))
                MINOR=0
                PATCH=0
                ;;
            minor)
                MINOR=$((MINOR + 1))
                PATCH=0
                ;;
            patch)
                PATCH=$((PATCH + 1))
                ;;
        esac
        NEXT_VERSION="$MAJOR.$MINOR.$PATCH"
    else
        echo "Error: Could not parse version from tag: $LATEST_TAG"
        exit 1
    fi
fi

echo "Next version: $NEXT_VERSION"

# Get changes since last tag (with file stats for better AI context)
if [ -n "$LATEST_TAG" ]; then
    CHANGES=$(git log $LATEST_TAG..HEAD --oneline --no-decorate --stat)
else
    CHANGES=$(git log --oneline --no-decorate --stat)
fi

# Show changes
echo ""
if [ -n "$LATEST_TAG" ]; then
    echo "Changes since $LATEST_TAG:"
else
    echo "All changes:"
fi
echo "---"
echo "$CHANGES"
echo "---"
echo ""

# Generate summary using LLM if API key is available
SUMMARY=""
if [ -n "$OPENAI_API_KEY" ] && [ -n "$CHANGES" ]; then
    echo "Generating AI summary of changes..."
    
    # Escape the changes for JSON
    CHANGES_ESCAPED=$(echo "$CHANGES" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
    PROMPT="Summarize the following git commits at an abstract level for end users. Focus on features, fixes, and improvements without technical implementation details. Keep it concise:\\n\\n$CHANGES_ESCAPED"
    
    # Call OpenAI API and parse response
    API_RESPONSE=$(curl -s https://api.openai.com/v1/chat/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}],\"temperature\":0.7,\"max_tokens\":500}")
    
    # Extract content using python if available, otherwise fallback to grep/sed
    if command -v python3 &> /dev/null; then
        SUMMARY=$(echo "$API_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['choices'][0]['message']['content'] if 'choices' in data else '')" 2>/dev/null)
    else
        SUMMARY=$(echo "$API_RESPONSE" | grep -o '"content"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"content"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/')
    fi
    
    if [ -n "$SUMMARY" ]; then
        echo ""
        echo "AI Summary:"
        echo "---"
        echo "$SUMMARY"
        echo "---"
        echo ""
    fi
fi

# Create tag with 'v' prefix (matching publish.yml workflow pattern)
TAG_NAME="v$NEXT_VERSION"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "📝 Would create tag: $TAG_NAME"
    echo ""
    echo "Tag message:"
    echo "---"
    if [ -z "$CHANGES" ]; then
        echo "No changes since last release."
    elif [ -n "$SUMMARY" ]; then
        echo "$SUMMARY"
    else
        if [ -n "$LATEST_TAG" ]; then
            echo "Changes since $LATEST_TAG:"
        else
            echo "Initial release:"
        fi
        echo "$CHANGES"
    fi
    echo "---"
    echo ""
    
    # Check for unpushed commits in dry-run
    git fetch origin
    LOCAL_COMMITS=$(git log origin/main..HEAD --oneline 2>/dev/null || git log origin/master..HEAD --oneline 2>/dev/null || echo "")
    if [ -n "$LOCAL_COMMITS" ]; then
        echo "Local commits that would be pushed:"
        echo "$LOCAL_COMMITS"
        echo ""
    fi
    
    echo "🚫 DRY RUN: No tag created, nothing pushed"
else
    # Check if tag already exists
    if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
        echo "Error: Tag $TAG_NAME already exists!"
        exit 1
    fi
    
    # Fetch to check for unpushed commits
    echo "Checking for unpushed commits..."
    git fetch origin
    
    # Determine the main branch name
    MAIN_BRANCH="main"
    if ! git show-ref --verify --quiet refs/remotes/origin/main; then
        MAIN_BRANCH="master"
    fi
    
    # Check if there are local commits to push
    LOCAL_COMMITS=$(git log origin/$MAIN_BRANCH..HEAD --oneline 2>/dev/null || echo "")
    if [ -n "$LOCAL_COMMITS" ]; then
        echo "Pushing local commits first..."
        echo "Commits to push:"
        echo "$LOCAL_COMMITS"
        echo ""
        git push origin HEAD:$MAIN_BRANCH
        echo "✓ Local commits pushed"
        echo ""
    else
        echo "No local commits to push"
        echo ""
    fi
    
    # Create tag with message
    echo "Creating tag $TAG_NAME..."
    if [ -z "$CHANGES" ]; then
        git tag -a "$TAG_NAME" -m "Release: $TAG_NAME" -m "No changes since last release."
    elif [ -n "$SUMMARY" ]; then
        git tag -a "$TAG_NAME" -m "Release: $TAG_NAME" -m "$SUMMARY"
    else
        if [ -n "$LATEST_TAG" ]; then
            git tag -a "$TAG_NAME" -m "Release: $TAG_NAME" -m "Changes since $LATEST_TAG:" -m "$CHANGES"
        else
            git tag -a "$TAG_NAME" -m "Release: $TAG_NAME" -m "Initial release:" -m "$CHANGES"
        fi
    fi

    # Push tag to trigger publish workflow
    echo "Pushing tag to remote..."
    git push origin "$TAG_NAME"

    echo "✓ Tag $TAG_NAME created and pushed successfully!"
    echo "The publish workflow will automatically build and publish to npm."
fi

