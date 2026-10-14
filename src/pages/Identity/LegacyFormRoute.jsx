import React, { useEffect, useState } from 'react';
import { message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import ActionModal from '@/components/Action/ActionModal';
import { checkActionPolicy } from '@/core/policy';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';

/**
 * Legacy mounted some identity modal forms as pages (/identity/project-admin/create,
 * /identity/user-admin/edit/:id, ...). The new console opens them from the list, so these deep
 * links render the list page with the form modal open and return to the list when it closes.
 *
 * props: list (component), listPath, action () => action, load (id) => item (edit forms)
 */
export default function LegacyFormRoute({ list: List, listPath, action: makeAction, load }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);

  useEffect(() => {
    let alive = true;
    const action = makeAction();
    const back = () => navigate(listPath, { replace: true });
    (async () => {
      try {
        const item = load && id ? await load(id) : null;
        if (!alive) return;
        if (!checkActionPolicy(action, { item }) || (item && action.allowed && !action.allowed(item))) {
          back();
          return;
        }
        const formItems =
          typeof action.getFormItems === 'function' ? await action.getFormItems(item) : action.formItems || [];
        const initialValues =
          typeof action.getDefaultValues === 'function' ? await action.getDefaultValues(item) : {};
        if (alive) setModal({ action, item, formItems, initialValues });
      } catch (err) {
        if (!alive) return;
        message.error(getErrorMessage(err, t('Failed to load action form')));
        back();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <>
      <List />
      {modal ? (
        <ActionModal
          open
          title={modal.action.title || modal.action.buttonText}
          description={modal.action.description || ''}
          item={modal.item || {}}
          formItems={modal.formItems}
          initialValues={modal.initialValues}
          width={modal.action.width}
          okText={modal.action.okText}
          quota={modal.action.quota}
          onSubmit={(values, item) => modal.action.onSubmit(values, item)}
          onCancel={() => navigate(listPath, { replace: true })}
        />
      ) : null}
    </>
  );
}
