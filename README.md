# markdown-journal README

My common journaling and task tracking workflows.

not ready for GA yet.

## commands

`markdown-journal.today`:

open today's journal.

The first time opening today's task carries over all tasks tagged with `tomorrow-tags` from the last journal.

`markdown-journal.add-tag`:
 prompt user select from existing tags from current doc, configuration, or input new tag.

tags are formatted as `## <task-header> (:tag-1:tag-2:...:)`

tag must be alphanumeric, dash or underscore.

`markdown-journal.compute-times`:

show a new buffer of total time per task, and time per tag

`markdown-journal.journals`:

List all journals, select one to open.

`markdown-journal.start-task`:

start timing a task, only one task can be running, multi-tasking is forbidden. Starting one task ends another.

intervals are tracked by a list in task section, prefixed by `journal-interval`

`markdown-journal.end-task`:

end task


## TODO

- [x] compute times for each tag
- [x] use local locale for timestamp.
- [ ] compute this weeks times.
- [ ] button in status bar to stop a task.
