const { query, withTransaction } = require('../db/pg');

async function updateOrderPaymentCondition(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const body = req.body || {};
  const rawCondition =
    body.paymentCondition || body.payment_condition || body.condition;
  if (!rawCondition || typeof rawCondition !== 'string') {
    return res.status(400).json({ error: 'Debe indicar paymentCondition' });
  }

  const pc = rawCondition.toUpperCase();
  let targetCondition = null;
  if (pc === 'CONTADO') targetCondition = 'CONTADO';
  if (pc === 'CTA_CTE' || pc === 'CTA-CTE' || pc === 'CUENTA_CORRIENTE') {
    targetCondition = 'CTA_CTE';
  }
  if (!targetCondition) {
    return res.status(400).json({ error: 'paymentCondition inválido' });
  }

  const dueDateRaw = body.dueDate || body.due_date || null;

  try {
    const result = await withTransaction(async (client) => {
      const { rows: orders } = await client.query(
        `SELECT id,
                client_id,
                payment_condition,
                total_amount::float AS total_amount,
                paid_amount::float AS paid_amount,
                balance::float AS balance,
                due_date
           FROM Orders
          WHERE id = $1
            AND deleted_at IS NULL
          FOR UPDATE`,
        [id]
      );
      if (!orders.length) {
        const err = new Error('Orden no encontrada');
        err.statusCode = 404;
        throw err;
      }
      const order = orders[0];
      const currentCondition = String(order.payment_condition || '').toUpperCase();

      // Solo actualizamos si realmente cambia la condición o si queremos ajustar due_date.
      if (currentCondition === targetCondition && !dueDateRaw) {
        return {
          id: order.id,
          paymentCondition: currentCondition,
          dueDate: order.due_date,
          paidAmount: order.paid_amount,
          balance: order.balance,
        };
      }

      // Normalizar nueva fecha de vencimiento si viene
      let newDueDate = order.due_date || null;
      if (dueDateRaw) {
        const d = new Date(dueDateRaw);
        if (isNaN(d.getTime())) {
          const err = new Error('Fecha de vencimiento inválida');
          err.statusCode = 400;
          throw err;
        }
        newDueDate = d;
      }

      // Transición CONTADO -> CTA_CTE
      if (currentCondition === 'CONTADO' && targetCondition === 'CTA_CTE') {
        if (!order.client_id) {
          const err = new Error(
            'No se puede pasar a cuenta corriente: la orden no está asociada a un cliente'
          );
          err.statusCode = 400;
          throw err;
        }

        const total = Number(order.total_amount || 0) || 0;

        // Soft delete de pagos anteriores (propios de CONTADO)
        await client.query(
          `DELETE FROM Payments
            WHERE order_id = $1
              AND deleted_at IS NULL`,
          [id]
        );

        // Registrar débito inicial en la cuenta corriente del cliente
        await client.query(
          `INSERT INTO ClientAccountMovements(
             client_id,
             order_id,
             movement_type,
             amount,
             description,
             created_by
           )
           VALUES ($1, $2, 'DEBITO', $3, $4, NULL)`,
          [
            order.client_id,
            id,
            total,
            'Alta de saldo en cuenta corriente desde administración',
          ]
        );

        // Si no vino dueDate y no había, calculamos una por defecto (+30 días)
        if (!newDueDate) {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          newDueDate = d;
        }

        const { rows: updated } = await client.query(
          `UPDATE Orders
              SET payment_condition = 'CTA_CTE',
                  due_date = $1,
                  paid_amount = 0,
                  balance = total_amount,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING payment_condition,
                      due_date,
                      paid_amount::float AS paid_amount,
                      balance::float AS balance`,
          [newDueDate, id]
        );
        const u = updated[0];
        return {
          id,
          paymentCondition: u.payment_condition,
          dueDate: u.due_date,
          paidAmount: u.paid_amount,
          balance: u.balance,
        };
      }

      // Transición CTA_CTE -> CONTADO
      if (currentCondition === 'CTA_CTE' && targetCondition === 'CONTADO') {
        const balance = Number(order.balance || 0) || 0;
        if (balance > 0.0001) {
          const err = new Error(
            'No se puede marcar como contado: la orden tiene saldo pendiente en cuenta corriente'
          );
          err.statusCode = 400;
          throw err;
        }

        const total = Number(order.total_amount || 0) || 0;

        const { rows: updated } = await client.query(
          `UPDATE Orders
              SET payment_condition = 'CONTADO',
                  paid_amount = $1,
                  balance = 0,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING payment_condition,
                      due_date,
                      paid_amount::float AS paid_amount,
                      balance::float AS balance`,
          [total, id]
        );
        const u = updated[0];
        return {
          id,
          paymentCondition: u.payment_condition,
          dueDate: u.due_date,
          paidAmount: u.paid_amount,
          balance: u.balance,
        };
      }

      // Mismo tipo, solo ajustar due_date (por ejemplo, updating vencimiento)
      if (currentCondition === 'CTA_CTE' && targetCondition === 'CTA_CTE') {
        if (!newDueDate) {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          newDueDate = d;
        }
        const { rows: updated } = await client.query(
          `UPDATE Orders
              SET due_date = $1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING payment_condition,
                      due_date,
                      paid_amount::float AS paid_amount,
                      balance::float AS balance`,
          [newDueDate, id]
        );
        const u = updated[0];
        return {
          id,
          paymentCondition: u.payment_condition,
          dueDate: u.due_date,
          paidAmount: u.paid_amount,
          balance: u.balance,
        };
      }

      // De CONTADO a CONTADO (con due_date opcional): simplemente devolver estado actual
      return {
        id: order.id,
        paymentCondition: currentCondition,
        dueDate: order.due_date,
        paidAmount: order.paid_amount,
        balance: order.balance,
      };
    });

    return res.json({
      ok: true,
      order: result,
    });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('updateOrderPaymentCondition error:', err.message);
    return res
      .status(500)
      .json({ error: 'No se pudo actualizar la condición de pago' });
  }
}

module.exports = {
  updateOrderPaymentCondition,
};

