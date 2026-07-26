import { Drawer, type DrawerProps, type SxProps, type Theme } from '@mui/material'

// Wraps MUI's bottom Drawer with the app's existing bottom-sheet look
// (rounded top corners only, safe-area-aware bottom padding, capped at the
// app shell's max width) — replaces the hand-rolled `fixed inset-0 z-50`
// overlay previously duplicated identically across ExerciseDetail,
// ExerciseForm, and ExercisePicker. Drawer already handles backdrop-click-
// to-dismiss, focus trapping, and Escape, which that hand-rolled version
// didn't.
export function BottomSheet({
  children,
  paperSx,
  ...props
}: DrawerProps & { paperSx?: SxProps<Theme> }) {
  return (
    <Drawer
      anchor="bottom"
      slotProps={{
        paper: {
          sx: [
            {
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              mx: 'auto',
              width: '100%',
              maxWidth: '32rem', // matches AppLayout's max-w-lg shell
              maxHeight: '85svh',
              pb: 'max(1rem, env(safe-area-inset-bottom))',
            },
            ...(Array.isArray(paperSx) ? paperSx : [paperSx]),
          ],
        },
      }}
      {...props}
    >
      {children}
    </Drawer>
  )
}
