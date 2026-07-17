import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const r = (p: string) => resolve(__dirname, p)

export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        hub: r('index.html'),
        dashboard: r('apps/organizer/dashboard.html'),
        createEvent: r('apps/organizer/create-event.html'),
        eventHub: r('apps/organizer/event-hub.html'),
        categories: r('apps/organizer/categories.html'),
        registrations: r('apps/organizer/registrations.html'),
        inbox: r('apps/organizer/inbox.html'),
        payments: r('apps/organizer/payments.html'),
        competition: r('apps/organizer/competition.html'),
        schedule: r('apps/organizer/schedule.html'),
        gironi: r('apps/organizer/gironi.html'),
        teams: r('apps/organizer/teams.html'),
        landing: r('apps/public/landing.html'),
        enroll: r('apps/public/enroll.html'),
        participants: r('apps/public/participants.html'),
        calendar: r('apps/public/calendar.html'),
        standings: r('apps/public/standings.html'),
        bracket: r('apps/public/bracket.html'),
        adminOrgs: r('apps/admin/organizations.html'),
        adminOrg: r('apps/admin/organization.html'),
      },
    },
  },
})
