import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { addDaysISO, localTodayISO } from './dateMath'
import { DatePickerPopup } from './DatePickerPopup'
import { mountFloatingPanel } from './FloatingPanel'
import { filterDateSuggestionItems, type DateSuggestionItem } from './suggestionItems'
import { SuggestionList, type SuggestionListHandle } from './SuggestionList'

const dateSuggestionPluginKey = new PluginKey('dateSuggestion')

// "@" trigger for inserting a date badge. "@today"/"@tomorrow" insert
// directly once selected; "@date" (matched via suggestionItems' keywords)
// instead opens the full quick-pick + calendar popup, since a single date
// doesn't need a picker but an arbitrary one does.
export const DateSuggestion = Extension.create({
  name: 'dateSuggestion',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      Suggestion<DateSuggestionItem>({
        editor,
        char: '@',
        pluginKey: dateSuggestionPluginKey,

        items: ({ query }) => filterDateSuggestionItems(query),

        command: ({ editor, range, props: item }) => {
          if (item.id === 'pick') {
            editor.chain().focus().deleteRange(range).run()
            const pos = editor.state.selection.from
            const coords = editor.view.coordsAtPos(pos)
            mountFloatingPanel(coords, (close) => (
              <DatePickerPopup
                onPick={(iso) => {
                  editor.chain().focus().insertContentAt(pos, { type: 'dateBadge', attrs: { date: iso } }).run()
                  close()
                }}
              />
            ))
            return
          }

          const iso = item.id === 'today' ? localTodayISO() : addDaysISO(localTodayISO(), 1)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: 'dateBadge', attrs: { date: iso } })
            .run()
        },

        render: () => {
          let component: ReactRenderer<SuggestionListHandle, { items: DateSuggestionItem[]; command: (item: DateSuggestionItem) => void }> | null =
            null
          let unmount: (() => void) | null = null

          return {
            onStart: (props: SuggestionProps<DateSuggestionItem>) => {
              component = new ReactRenderer(SuggestionList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              })
              // `mount()` only ever sets position/left/top on the element it
              // appends to document.body - left at the default z-index:auto,
              // it paints behind any of this app's `fixed` modals (TodoDetail,
              // the enlarged notes editor, ...), which establish their own
              // stacking context via their explicit z-40+ classes. Match
              // FloatingPanel's z-80 so the dropdown stays on top everywhere
              // the notes editor can appear.
              component.element.style.zIndex = '80'
              unmount = props.mount(component.element)
            },

            onUpdate: (props: SuggestionProps<DateSuggestionItem>) => {
              component?.updateProps({ items: props.items, command: props.command })
            },

            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                exitSuggestion(props.view, dateSuggestionPluginKey)
                return true
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false
            },

            onExit: () => {
              unmount?.()
              component?.destroy()
              component = null
              unmount = null
            },
          }
        },
      }),
    ]
  },
})
