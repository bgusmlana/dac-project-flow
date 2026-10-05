import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Konfirmasi aktifkan / nonaktifkan data. */
export function ToggleActiveDialog({
  name,
  isActive,
  pending,
  onConfirm,
  onClose,
}: {
  name: string;
  isActive: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isActive ? 'Nonaktifkan' : 'Aktifkan'} “{name}”?</DialogTitle>
          <DialogDescription>
            {isActive
              ? 'Data tidak akan muncul lagi di pilihan, tapi riwayat yang sudah memakainya tetap tersimpan.'
              : 'Data akan muncul kembali di pilihan.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant={isActive ? 'destructive' : 'default'} disabled={pending} onClick={onConfirm}>
            {isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
