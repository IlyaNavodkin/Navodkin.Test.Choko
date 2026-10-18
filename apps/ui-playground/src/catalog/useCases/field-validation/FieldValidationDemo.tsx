import { useState } from 'react';
import { Button, ErrorLabel, Input, Label } from '@codaa/ui';
import { createFieldSchema } from './schema';
import { useZodForm } from './useZodForm';
import { DemoFrame, Flag } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
export function FieldValidationDemo() {
  const form = useZodForm({ initialValues: { name: '' }, schema: createFieldSchema(t('required')) });
  const [long, setLong] = useState(false);
  const [output, setOutput] = useState<string>();
  return <DemoFrame output={output} controls={<Flag label={t('longer')} value={long} onChange={setLong} />}>
    <form onSubmit={e => { e.preventDefault(); const result = form.validate(); if (result) setOutput(`${t('saved')}: ${result.name}`); }}>
      <Label label={<label htmlFor="demo-name">{t('name')}{long ? ` · ${t('required')} *` : ' *'}</label>}>
        <Input id="demo-name" value={form.values.name} aria-invalid={Boolean(form.errors.name)} aria-describedby={form.errors.name ? 'demo-name-error' : undefined} onChange={e => form.setFieldValue('name', e.target.value)} />
      </Label><ErrorLabel id="demo-name-error">{form.errors.name}</ErrorLabel><Button type="submit">{t('submit')}</Button>
    </form>
  </DemoFrame>;
}
