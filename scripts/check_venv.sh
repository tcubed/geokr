echo "Virtualenv usage summary:"
echo "------------------------"

# Directories to check
VENV_DIRS=(~/py310 ~/.virtualenvs)

# Get virtualenvs used by web apps
WEB_USED=$(grep -R 'virtualenv' ~/var/webapps/*/ 2>/dev/null | awk -F': ' '{print $2}' | sort | uniq)

# Get virtualenvs used by scheduled tasks
TASK_USED=$(cat ~/var/tasks/*.sh 2>/dev/null | grep 'source ~/.virtualenvs' | awk '{print $2}' | sort | uniq)

for dir in "${VENV_DIRS[@]}"; do
    [ -d "$dir" ] || continue

    if [[ "$dir" == ~/.virtualenvs ]]; then
        # Iterate over virtualenvs inside ~/.virtualenvs
        for venv in "$dir"/*; do
            [ -d "$venv" ] || continue
            size=$(du -sh "$venv" | awk '{print $1}')
            name=$(basename "$venv")
            in_use="No"
            for used in $WEB_USED $TASK_USED; do
                if [[ "$venv" == "$used"* ]]; then
                    in_use="Yes"
                    break
                fi
            done
            echo "Virtualenv: $name | Parent: ~/.virtualenvs | Size: $size | In use: $in_use"
        done
    else
        # Single virtualenv like ~/py310
        size=$(du -sh "$dir" | awk '{print $1}')
        name=$(basename "$dir")
        in_use="No"
        for used in $WEB_USED $TASK_USED; do
            if [[ "$dir" == "$used"* ]]; then
                in_use="Yes"
                break
            fi
        done
        echo "Virtualenv: $name | Parent: ~ | Size: $size | In use: $in_use"
    fi
done
