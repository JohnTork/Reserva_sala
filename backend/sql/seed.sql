START TRANSACTION;

INSERT INTO salas (nome, andar, capacidade, recursos)
SELECT 'Sala 101', '1º andar', 30, JSON_ARRAY('Quadro', 'Datashow')
WHERE NOT EXISTS (SELECT 1 FROM salas WHERE nome = 'Sala 101');

INSERT INTO salas (nome, andar, capacidade, recursos)
SELECT 'Sala 202', '2º andar', 30, JSON_ARRAY('Quadro')
WHERE NOT EXISTS (SELECT 1 FROM salas WHERE nome = 'Sala 202');

INSERT INTO salas (nome, andar, capacidade, recursos)
SELECT 'Auditório', 'Térreo', 200, JSON_ARRAY('Datashow', 'Microfone', 'Sistema de som')
WHERE NOT EXISTS (SELECT 1 FROM salas WHERE nome = 'Auditório');

INSERT INTO reservas (sala_id, data, inicio, fim, responsavel, finalidade, situacao)
SELECT sala.id, DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '08:00:00', '09:00:00',
       'Ana Souza', 'Aula de matemática', 'aprovada'
FROM salas sala
WHERE sala.nome = 'Sala 101'
  AND NOT EXISTS (
    SELECT 1 FROM reservas reserva
    WHERE reserva.sala_id = sala.id
      AND reserva.data = DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
      AND reserva.inicio = '08:00:00'
  )
LIMIT 1;

INSERT INTO reservas (sala_id, data, inicio, fim, responsavel, finalidade, situacao)
SELECT sala.id, DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '09:00:00', '10:00:00',
       'Carlos Lima', 'Reunião pedagógica', 'pendente'
FROM salas sala
WHERE sala.nome = 'Sala 101'
  AND NOT EXISTS (
    SELECT 1 FROM reservas reserva
    WHERE reserva.sala_id = sala.id
      AND reserva.data = DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
      AND reserva.inicio = '09:00:00'
  )
LIMIT 1;

INSERT INTO reservas (sala_id, data, inicio, fim, responsavel, finalidade, situacao)
SELECT sala.id, DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '08:00:00', '10:00:00',
       'Mariana Alves', 'Aula de ciências', 'aprovada'
FROM salas sala
WHERE sala.nome = 'Sala 202'
  AND NOT EXISTS (
    SELECT 1 FROM reservas reserva
    WHERE reserva.sala_id = sala.id
      AND reserva.data = DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
      AND reserva.inicio = '08:00:00'
  )
LIMIT 1;

INSERT INTO reservas (sala_id, data, inicio, fim, responsavel, finalidade, situacao)
SELECT sala.id, DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), '13:00:00', '14:30:00',
       'João Pereira', 'Palestra para estudantes', 'pendente'
FROM salas sala
WHERE sala.nome = 'Auditório'
  AND NOT EXISTS (
    SELECT 1 FROM reservas reserva
    WHERE reserva.sala_id = sala.id
      AND reserva.data = DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)
      AND reserva.inicio = '13:00:00'
  )
LIMIT 1;

INSERT INTO reservas (sala_id, data, inicio, fim, responsavel, finalidade, situacao)
SELECT sala.id, DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), '14:30:00', '16:00:00',
       'Beatriz Costa', 'Formação de professores', 'aprovada'
FROM salas sala
WHERE sala.nome = 'Auditório'
  AND NOT EXISTS (
    SELECT 1 FROM reservas reserva
    WHERE reserva.sala_id = sala.id
      AND reserva.data = DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)
      AND reserva.inicio = '14:30:00'
  )
LIMIT 1;

COMMIT;
