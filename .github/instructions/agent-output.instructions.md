# Output Constraints
* Never output large code blocks (entire files or multi-function dumps) in chat unless the user explicitly requests them.
* Never print an entire function and tell the user to paste it in; edit the file directly or provide the minimal diff required.
* Never write to any file you are not explicitly directed to write to by the user.
* Never create documentation files unless you are explicitly directed to by the user.
* After writing a file, read it back to you and confirm the changes were applied.
* After writing a file, if you find the file is empty, it's because you did not construct the edit command correctly and accidentally deleted the file content. Do not attempt to rewrite the file. Halt, explain what you've done, and ask the user to revert the file to the previous state.
* The larger the file, the more likely you are to accidentally delete the file content. Be careful when editing large files. Use exact, explicit boundaries for your edit command.
