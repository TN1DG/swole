import { describe, expect, it } from 'vitest'
import { planNotification, safeAppPath } from './pushPayload'

describe('planNotification', () => {
  it('turns a chat push into a notification that updates in place', () => {
    const plan = planNotification(
      JSON.stringify({ title: 'Sam', body: 'leg day?', url: '/friends/1/chat', tag: 'chat-1' }),
    )
    expect(plan.title).toBe('Sam')
    expect(plan.options).toMatchObject({
      body: 'leg day?',
      tag: 'chat-1',
      renotify: true,
      data: { url: '/friends/1/chat' },
    })
  })

  // Chrome throws on renotify with no tag, which would lose the notification.
  it('leaves renotify off when there is no tag', () => {
    const plan = planNotification(JSON.stringify({ title: 'Sam', url: '/' }))
    expect(plan.options).not.toHaveProperty('renotify')
    expect(plan.options).not.toHaveProperty('tag')
  })

  it.each([null, undefined, '', 'not json', '[]', 'null', '{"title":5}'])(
    'still shows something for %j',
    (raw) => {
      const plan = planNotification(raw)
      expect(plan.title).toBe('Swole')
      expect(plan.options.data.url).toBe('/')
    },
  )
})

describe('safeAppPath', () => {
  it('keeps paths inside the app', () => {
    expect(safeAppPath('/friends/1/chat')).toBe('/friends/1/chat')
    expect(safeAppPath('/friends?tab=chats')).toBe('/friends?tab=chats')
  })

  it.each(['https://evil.example.com', '//evil.example.com', '/\\evil.example.com', 'javascript:alert(1)', '', 5, null])(
    'sends %j home instead',
    (url) => {
      expect(safeAppPath(url)).toBe('/')
    },
  )
})
